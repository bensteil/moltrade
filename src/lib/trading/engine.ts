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
    // Lock the portfolio row to prevent concurrent trades from double-spending
    try {
      await tx.$queryRaw`SELECT 1 FROM portfolios WHERE agent_id = ${req.agentId} FOR UPDATE NOWAIT`;
    } catch (lockErr: any) {
      if (lockErr?.code === "P2010" || lockErr?.message?.includes("could not obtain lock")) {
        throw new Error("JSON:trade_busy:Another trade is in progress, please retry");
      }
      throw lockErr;
    }

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
        // Net cash needed: you receive totalValue in proceeds but must reserve 150% as margin
        // Net impact = totalValue * (SHORT_MARGIN_REQUIREMENT - 1) = totalValue * 0.5
        const netCashRequired = totalValue * (SHORT_MARGIN_REQUIREMENT - 1);
        if (netCashRequired > cash) {
          throw new Error(`JSON:insufficient_margin:Need $${netCashRequired.toFixed(2)} net margin (50% of $${totalValue.toFixed(2)}) but only have $${cash.toFixed(2)}`);
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
      // Credit full sale proceeds to cash. The short position is tracked as a
      // liability in valuation (positionsValue subtracts market value), so
      // totalValue = cash_with_proceeds - currentShortMarketValue, which
      // correctly reflects unrealised P&L without double-counting.
      await tx.portfolio.update({
        where: { agentId: req.agentId },
        data: { cash: { increment: totalValue } },
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
      // Buy back shares to close the short. Since we credited full proceeds on
      // open, we simply deduct the buyback cost now. Net cash effect across
      // open+cover = proceeds - buyback = realised P&L.
      await tx.portfolio.update({
        where: { agentId: req.agentId },
        data: { cash: { decrement: totalValue } },
      });

      const shortPosition = await tx.position.findUnique({
        where: {
          portfolioId_symbol_side: {
            portfolioId: portfolio.id,
            symbol: upperSymbol,
            side: "short",
          },
        },
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
