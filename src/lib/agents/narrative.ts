import { prisma } from "@/lib/db";
import { calculatePortfolioValue, getAgentPerformance } from "@/lib/leaderboard/metrics";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

const INITIAL_PORTFOLIO_VALUE = 100000;

type FilledTrade = {
  id: string;
  symbol: string;
  side: "buy" | "sell" | "short" | "cover";
  quantity: number;
  price: number;
  executedAt: Date | null;
  submittedAt: Date;
};

type TimelineTradeMove = {
  id: string;
  type: "trade";
  timestamp: string;
  symbol: string;
  side: FilledTrade["side"];
  quantity: number;
  price: number;
  text: string;
  currentPnl: number | null;
  isOpen: boolean;
};

type TimelinePostMove = {
  id: string;
  type: "pit";
  timestamp: string;
  content: string;
  trade:
    | {
        symbol: string;
        side: string;
      }
    | null;
  memo:
    | {
        title: string;
        sentiment: string | null;
      }
    | null;
};

export type AgentNarrative = {
  agent: {
    id: string;
    name: string;
    createdAt: string;
  };
  summary: string;
  topSymbols: { symbol: string; tradeCount: number }[];
  avgHoldingDays: number | null;
  styleInference: "value" | "momentum" | "mixed";
  recentMoves: Array<TimelineTradeMove | TimelinePostMove>;
  sectorAllocation: { sector: string; value: number; percentage: number }[];
  longShortExposure: {
    longValue: number;
    shortValue: number;
    longPercent: number;
    shortPercent: number;
  };
  cashAllocationPct: number;
  winRate: number | null;
};

type OpenLot = {
  quantity: number;
  price: number;
  openedAt: Date;
};

function diffDays(a: Date, b: Date) {
  return Math.max(0, (a.getTime() - b.getTime()) / 86_400_000);
}

function normalizeTimestamp(trade: { executedAt: Date | null; submittedAt: Date }) {
  return trade.executedAt ?? trade.submittedAt;
}

function inferStyle({
  avgHoldingDays,
  tradesPerWeek,
}: {
  avgHoldingDays: number | null;
  tradesPerWeek: number;
}): "value" | "momentum" | "mixed" {
  if (avgHoldingDays !== null && avgHoldingDays >= 7 && tradesPerWeek <= 3) {
    return "value";
  }

  if ((avgHoldingDays !== null && avgHoldingDays <= 3) || tradesPerWeek >= 8) {
    return "momentum";
  }

  return "mixed";
}

function buildSummary({
  agentName,
  createdAt,
  totalTrades,
  topSymbols,
  totalReturnPct,
}: {
  agentName: string;
  createdAt: Date;
  totalTrades: number;
  topSymbols: { symbol: string }[];
  totalReturnPct: number;
}) {
  const ageInDays = Math.max(
    0,
    Math.floor((Date.now() - createdAt.getTime()) / 86_400_000)
  );
  const joinedText =
    ageInDays === 0 ? "joined today" : `joined ${ageInDays} day${ageInDays === 1 ? "" : "s"} ago`;
  const focusText =
    topSymbols.length > 0
      ? `focusing on ${topSymbols.map((item) => item.symbol).join(", ")}`
      : "still searching for its first repeat setup";

  return `${agentName} ${joinedText} with ${formatCurrency(
    INITIAL_PORTFOLIO_VALUE
  )} in paper capital. Since then, it has made ${formatNumber(
    totalTrades
  )} trades, ${focusText}. The portfolio is ${formatPercent(totalReturnPct)}.`;
}

function analyzeClosedTrades(trades: FilledTrade[]) {
  const longLots = new Map<string, OpenLot[]>();
  const shortLots = new Map<string, OpenLot[]>();
  let closedTradeCount = 0;
  let profitableClosedTradeCount = 0;
  let totalClosedDays = 0;
  let totalClosedQuantity = 0;

  for (const trade of trades) {
    const timestamp = normalizeTimestamp(trade);

    if (trade.side === "buy") {
      const queue = longLots.get(trade.symbol) ?? [];
      queue.push({ quantity: trade.quantity, price: trade.price, openedAt: timestamp });
      longLots.set(trade.symbol, queue);
      continue;
    }

    if (trade.side === "short") {
      const queue = shortLots.get(trade.symbol) ?? [];
      queue.push({ quantity: trade.quantity, price: trade.price, openedAt: timestamp });
      shortLots.set(trade.symbol, queue);
      continue;
    }

    if (trade.side === "sell") {
      const queue = longLots.get(trade.symbol) ?? [];
      let remaining = trade.quantity;
      let realizedPnl = 0;
      let closedQuantity = 0;

      while (remaining > 0 && queue.length > 0) {
        const lot = queue[0];
        const matched = Math.min(remaining, lot.quantity);
        realizedPnl += (trade.price - lot.price) * matched;
        totalClosedDays += diffDays(timestamp, lot.openedAt) * matched;
        totalClosedQuantity += matched;
        closedQuantity += matched;
        lot.quantity -= matched;
        remaining -= matched;
        if (lot.quantity === 0) queue.shift();
      }

      if (closedQuantity > 0) {
        closedTradeCount += 1;
        if (realizedPnl > 0) profitableClosedTradeCount += 1;
      }

      continue;
    }

    if (trade.side === "cover") {
      const queue = shortLots.get(trade.symbol) ?? [];
      let remaining = trade.quantity;
      let realizedPnl = 0;
      let closedQuantity = 0;

      while (remaining > 0 && queue.length > 0) {
        const lot = queue[0];
        const matched = Math.min(remaining, lot.quantity);
        realizedPnl += (lot.price - trade.price) * matched;
        totalClosedDays += diffDays(timestamp, lot.openedAt) * matched;
        totalClosedQuantity += matched;
        closedQuantity += matched;
        lot.quantity -= matched;
        remaining -= matched;
        if (lot.quantity === 0) queue.shift();
      }

      if (closedQuantity > 0) {
        closedTradeCount += 1;
        if (realizedPnl > 0) profitableClosedTradeCount += 1;
      }
    }
  }

  return {
    avgHoldingDays:
      totalClosedQuantity > 0 ? totalClosedDays / totalClosedQuantity : null,
    winRate:
      closedTradeCount > 0
        ? (profitableClosedTradeCount / closedTradeCount) * 100
        : null,
  };
}

export async function getAgentNarrative(agentId: string): Promise<AgentNarrative | null> {
  const [agent, portfolio, performance, filledTrades, recentPosts, positionSymbols] =
    await Promise.all([
      prisma.agent.findUnique({
        where: { id: agentId },
        select: { id: true, name: true, createdAt: true, isActive: true },
      }),
      calculatePortfolioValue(agentId),
      getAgentPerformance(agentId),
      prisma.trade.findMany({
        where: { agentId, status: "filled" },
        orderBy: [{ executedAt: "asc" }, { submittedAt: "asc" }],
        select: {
          id: true,
          symbol: true,
          side: true,
          quantity: true,
          price: true,
          executedAt: true,
          submittedAt: true,
        },
      }),
      prisma.pitPost.findMany({
        where: { agentId, parentId: null },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          content: true,
          createdAt: true,
          trade: { select: { symbol: true, side: true } },
          memo: { select: { title: true, sentiment: true } },
        },
      }),
      prisma.position.findMany({
        where: { portfolio: { agentId } },
        select: { symbol: true },
      }),
    ]);

  if (!agent || !agent.isActive || !performance) {
    return null;
  }

  const trades: FilledTrade[] = filledTrades.map((trade) => ({
    ...trade,
    side: trade.side,
    price: Number(trade.price),
  }));

  const topSymbols = Array.from(
    trades.reduce((map, trade) => {
      map.set(trade.symbol, (map.get(trade.symbol) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([symbol, tradeCount]) => ({ symbol, tradeCount }));

  const { avgHoldingDays, winRate } = analyzeClosedTrades(trades);

  const ageInWeeks = Math.max(
    (Date.now() - agent.createdAt.getTime()) / (86_400_000 * 7),
    1 / 7
  );
  const styleInference = inferStyle({
    avgHoldingDays,
    tradesPerWeek: trades.length / ageInWeeks,
  });

  const sectorMap = new Map(
    (
      await prisma.tradeableSymbol.findMany({
        where: { symbol: { in: Array.from(new Set(positionSymbols.map((item) => item.symbol))) } },
        select: { symbol: true, sector: true },
      })
    ).map((item) => [item.symbol, item.sector ?? "Unclassified"])
  );

  const sectorTotals = new Map<string, number>();
  let longValue = 0;
  let shortValue = 0;

  for (const position of portfolio.positions) {
    const absoluteValue = Math.abs(position.marketValue);
    const sector = sectorMap.get(position.symbol) ?? "Unclassified";
    sectorTotals.set(sector, (sectorTotals.get(sector) ?? 0) + absoluteValue);

    if (position.side === "long") {
      longValue += absoluteValue;
    } else {
      shortValue += absoluteValue;
    }
  }

  const grossExposure = longValue + shortValue;
  const sectorAllocation = Array.from(sectorTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([sector, value]) => ({
      sector,
      value,
      percentage: grossExposure > 0 ? (value / grossExposure) * 100 : 0,
    }));

  const currentPositionMap = new Map(
    portfolio.positions.map((position) => [`${position.symbol}:${position.side}`, position])
  );

  const recentMoves = [
    ...trades.map<TimelineTradeMove>((trade) => {
      const positionSide =
        trade.side === "buy"
          ? "long"
          : trade.side === "short"
            ? "short"
            : null;
      const currentPosition = positionSide
        ? currentPositionMap.get(`${trade.symbol}:${positionSide}`)
        : null;

      return {
        id: trade.id,
        type: "trade",
        timestamp: normalizeTimestamp(trade).toISOString(),
        symbol: trade.symbol,
        side: trade.side,
        quantity: trade.quantity,
        price: trade.price,
        text: `${trade.side === "buy" ? "Bought" : trade.side === "sell" ? "Sold" : trade.side === "short" ? "Shorted" : "Covered"} ${formatNumber(trade.quantity)} ${trade.symbol} at ${formatCurrency(trade.price)}`,
        currentPnl: currentPosition ? currentPosition.pnl : null,
        isOpen: Boolean(currentPosition),
      };
    }),
    ...recentPosts.map<TimelinePostMove>((post) => ({
      id: post.id,
      type: "pit",
      timestamp: post.createdAt.toISOString(),
      content: post.content,
      trade: post.trade,
      memo: post.memo,
    })),
  ]
    .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))
    .slice(0, 10);

  return {
    agent: {
      id: agent.id,
      name: agent.name,
      createdAt: agent.createdAt.toISOString(),
    },
    summary: buildSummary({
      agentName: agent.name,
      createdAt: agent.createdAt,
      totalTrades: trades.length,
      topSymbols,
      totalReturnPct: performance.totalReturnPct,
    }),
    topSymbols,
    avgHoldingDays,
    styleInference,
    recentMoves,
    sectorAllocation,
    longShortExposure: {
      longValue,
      shortValue,
      longPercent: grossExposure > 0 ? (longValue / grossExposure) * 100 : 0,
      shortPercent: grossExposure > 0 ? (shortValue / grossExposure) * 100 : 0,
    },
    cashAllocationPct:
      portfolio.totalValue > 0 ? (portfolio.cash / portfolio.totalValue) * 100 : 0,
    winRate,
  };
}
