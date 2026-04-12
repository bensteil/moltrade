import { prisma } from "../db";
import { isMarketOpen } from "./hours";
import { getQuote } from "../market/cache";

interface TradeRequest {
  agentId: string;
  symbol: string;
  side: "buy" | "sell" | "short" | "cover";
  quantity: number;
}

interface TradeResult {
  success: boolean;
  trade?: {
    id: string;
    symbol: string;
    side: string;
    quantity: number;
    price: number;
    totalValue: number;
    status: string;
    executedAt: string;
  };
  error?: {
    code: string;
    message: string;
    nextOpen?: string;
  };
}

const SHORT_MARGIN_REQUIREMENT = 1.5; // 150%

export async function executeTrade(req: TradeRequest): Promise<TradeResult> {
  // 1. Check market hours
  const marketStatus = isMarketOpen();
  if (!marketStatus.open) {
    return {
      success: false,
      error: {
        code: "market_closed",
        message: `Market is closed: ${marketStatus.reason}`,
        nextOpen: marketStatus.nextOpen,
      },
    };
  }

  // 2. Check symbol is tradeable
  const symbol = await prisma.tradeableSymbol.findUnique({
    where: { symbol: req.symbol.toUpperCase() },
  });
  if (!symbol || !symbol.isActive) {
    return {
      success: false,
      error: {
        code: "invalid_symbol",
        message: `${req.symbol} is not in the tradeable universe`,
      },
    };
  }

  // 3. Get current price
  const quote = await getQuote(req.symbol.toUpperCase());
  if (!quote || !quote.price) {
    return {
      success: false,
      error: {
        code: "price_unavailable",
        message: `Unable to fetch price for ${req.symbol}`,
      },
    };
  }

  const price = quote.price;
  const totalValue = price * req.quantity;

  // 4. Execute validation + trade in a single transaction
  try {
  const trade = await prisma.$transaction(async (tx) => {
    // Fetch portfolio INSIDE transaction for consistency
    const portfolio = await tx.portfolio.findUnique({
      where: { agentId: req.agentId },
      include: { positions: true },
    });

    if (!portfolio) {
      throw new Error("JSON:no_portfolio:Portfolio not found");
    }

    const cash = Number(portfolio.cash);

    // Validate based on trade side
    switch (req.side) {
      case "buy": {
        if (totalValue > cash) {
          throw new Error(`JSON:insufficient_funds:Need $${totalValue.toFixed(2)} but only have $${cash.toFixed(2)}`);
        }
        break;
      }
      case "sell": {
        const position = portfolio.positions.find(
          (p) => p.symbol === req.symbol.toUpperCase() && p.side === "long"
        );
        if (!position || position.quantity < req.quantity) {
          throw new Error(`JSON:insufficient_shares:Not enough shares to sell. Have ${position?.quantity ?? 0}, need ${req.quantity}`);
        }
        break;
      }
      case "short": {
        const marginRequired = totalValue * SHORT_MARGIN_REQUIREMENT;
        if (marginRequired > cash) {
          throw new Error(`JSON:insufficient_margin:Need $${marginRequired.toFixed(2)} margin (150%) but only have $${cash.toFixed(2)}`);
        }
        break;
      }
      case "cover": {
        const shortPosition = portfolio.positions.find(
          (p) => p.symbol === req.symbol.toUpperCase() && p.side === "short"
        );
        if (!shortPosition || shortPosition.quantity < req.quantity) {
          throw new Error(`JSON:insufficient_short_shares:Not enough short shares to cover. Have ${shortPosition?.quantity ?? 0}, need ${req.quantity}`);
        }
        if (totalValue > cash) {
          throw new Error(`JSON:insufficient_funds:Need $${totalValue.toFixed(2)} to cover but only have $${cash.toFixed(2)}`);
        }
        break;
      }
    }
    // Create trade record
    const trade = await tx.trade.create({
      data: {
        agentId: req.agentId,
        symbol: req.symbol.toUpperCase(),
        side: req.side,
        quantity: req.quantity,
        price: Number(price),
        totalValue: Number(totalValue),
        status: "filled",
        executedAt: new Date(),
      },
    });

    // Update portfolio cash and positions
    const upperSymbol = req.symbol.toUpperCase();

    if (req.side === "buy") {
      await tx.portfolio.update({
        where: { agentId: req.agentId },
        data: { cash: { decrement: totalValue } },
      });

      const existing = await tx.position.findUnique({
        where: {
          portfolioId_symbol_side: {
            portfolioId: portfolio.id,
            symbol: upperSymbol,
            side: "long",
          },
        },
      });

      if (existing) {
        const newQuantity = existing.quantity + req.quantity;
        const newAvgCost =
          (Number(existing.avgCostBasis) * existing.quantity +
            price * req.quantity) /
          newQuantity;
        await tx.position.update({
          where: { id: existing.id },
          data: {
            quantity: newQuantity,
            avgCostBasis: Number(newAvgCost),
          },
        });
      } else {
        await tx.position.create({
          data: {
            portfolioId: portfolio.id,
            symbol: upperSymbol,
            side: "long",
            quantity: req.quantity,
            avgCostBasis: Number(price),
          },
        });
      }
    } else if (req.side === "sell") {
      await tx.portfolio.update({
        where: { agentId: req.agentId },
        data: { cash: { increment: totalValue } },
      });

      const position = await tx.position.findUnique({
        where: {
          portfolioId_symbol_side: {
            portfolioId: portfolio.id,
            symbol: upperSymbol,
            side: "long",
          },
        },
      });

      if (position!.quantity === req.quantity) {
        await tx.position.delete({ where: { id: position!.id } });
      } else {
        await tx.position.update({
          where: { id: position!.id },
          data: { quantity: { decrement: req.quantity } },
        });
      }
    } else if (req.side === "short") {
      // Reserve margin (150% of short value)
      const marginReserved = totalValue * SHORT_MARGIN_REQUIREMENT;
      await tx.portfolio.update({
        where: { agentId: req.agentId },
        data: { cash: { decrement: marginReserved } },
      });

      const existing = await tx.position.findUnique({
        where: {
          portfolioId_symbol_side: {
            portfolioId: portfolio.id,
            symbol: upperSymbol,
            side: "short",
          },
        },
      });

      if (existing) {
        const newQuantity = existing.quantity + req.quantity;
        const newAvgCost =
          (Number(existing.avgCostBasis) * existing.quantity +
            price * req.quantity) /
          newQuantity;
        await tx.position.update({
          where: { id: existing.id },
          data: {
            quantity: newQuantity,
            avgCostBasis: Number(newAvgCost),
          },
        });
      } else {
        await tx.position.create({
          data: {
            portfolioId: portfolio.id,
            symbol: upperSymbol,
            side: "short",
            quantity: req.quantity,
            avgCostBasis: Number(price),
          },
        });
      }
    } else if (req.side === "cover") {
      // Return margin and account for P&L
      const shortPosition = await tx.position.findUnique({
        where: {
          portfolioId_symbol_side: {
            portfolioId: portfolio.id,
            symbol: upperSymbol,
            side: "short",
          },
        },
      });

      const originalMargin =
        Number(shortPosition!.avgCostBasis) *
        req.quantity *
        SHORT_MARGIN_REQUIREMENT;
      const coverCost = totalValue;
      const shortProceeds = Number(shortPosition!.avgCostBasis) * req.quantity;
      const pnl = shortProceeds - coverCost;
      const cashReturn = originalMargin + pnl;

      await tx.portfolio.update({
        where: { agentId: req.agentId },
        data: { cash: { increment: cashReturn } },
      });

      if (shortPosition!.quantity === req.quantity) {
        await tx.position.delete({ where: { id: shortPosition!.id } });
      } else {
        await tx.position.update({
          where: { id: shortPosition!.id },
          data: { quantity: { decrement: req.quantity } },
        });
      }
    }

    return trade;
  });

  return {
    success: true,
    trade: {
      id: trade.id,
      symbol: trade.symbol,
      side: trade.side,
      quantity: trade.quantity,
      price: Number(trade.price),
      totalValue: Number(trade.totalValue),
      status: trade.status,
      executedAt: trade.executedAt!.toISOString(),
    },
  };
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.startsWith("JSON:")) {
      const [, code, message] = msg.split(":");
      return { success: false, error: { code, message } };
    }
    throw e;
  }
}
