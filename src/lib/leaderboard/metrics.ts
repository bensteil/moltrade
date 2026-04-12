import { prisma } from "../db";
import { getQuote, getBatchQuotes } from "../market/cache";

const INITIAL_PORTFOLIO_VALUE = 100000;
const RISK_FREE_RATE = 0.05; // 5% annual

export interface AgentPerformance {
  agentId: string;
  agentName: string;
  totalValue: number;
  cash: number;
  positionsValue: number;
  totalReturn: number;
  totalReturnPct: number;
  ytdReturn: number | null;
  oneYearReturn: number | null;
  sharpeRatio: number | null;
  maxDrawdown: number | null;
  winRate: number | null;
  totalTrades: number;
  lastTradeAt: string | null;
}

export async function calculatePortfolioValue(agentId: string): Promise<{
  totalValue: number;
  cash: number;
  positionsValue: number;
  positions: { symbol: string; side: string; quantity: number; marketValue: number; costBasis: number; pnl: number }[];
}> {
  const portfolio = await prisma.portfolio.findUnique({
    where: { agentId },
    include: { positions: true },
  });

  if (!portfolio) {
    return { totalValue: 0, cash: 0, positionsValue: 0, positions: [] };
  }

  const cash = Number(portfolio.cash);

  // Batch fetch all quotes at once
  const symbols = portfolio.positions.map((p) => p.symbol);
  const quotes = symbols.length > 0 ? await getBatchQuotes(symbols) : {};

  let positionsValue = 0;
  const positionDetails: { symbol: string; side: string; quantity: number; marketValue: number; costBasis: number; pnl: number }[] = [];

  for (const pos of portfolio.positions) {
    const quote = quotes[pos.symbol];
    const currentPrice = quote?.price ?? Number(pos.avgCostBasis);
    const costBasis = Number(pos.avgCostBasis) * pos.quantity;
    let marketValue: number;
    let pnl: number;

    if (pos.side === "long") {
      marketValue = currentPrice * pos.quantity;
      pnl = marketValue - costBasis;
    } else {
      marketValue = currentPrice * pos.quantity;
      pnl = costBasis - marketValue;
    }

    positionsValue += marketValue;
    positionDetails.push({
      symbol: pos.symbol,
      side: pos.side,
      quantity: pos.quantity,
      marketValue,
      costBasis,
      pnl,
    });
  }

  return {
    totalValue: cash + positionsValue,
    cash,
    positionsValue,
    positions: positionDetails,
  };
}

export async function getAgentPerformance(agentId: string): Promise<AgentPerformance | null> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) return null;

  const portfolio = await calculatePortfolioValue(agentId);
  const totalReturn = portfolio.totalValue - INITIAL_PORTFOLIO_VALUE;
  const totalReturnPct = (totalReturn / INITIAL_PORTFOLIO_VALUE) * 100;

  const [snapshots, trades] = await Promise.all([
    prisma.portfolioSnapshot.findMany({
      where: { agentId },
      orderBy: { date: "asc" },
    }),
    prisma.trade.findMany({
      where: { agentId, status: "filled" },
      orderBy: { executedAt: "desc" },
    }),
  ]);

  const { ytdReturn, oneYearReturn, sharpeRatio, maxDrawdown } = calculateSnapshotMetrics(
    snapshots,
    portfolio.totalValue
  );

  return {
    agentId,
    agentName: agent.name,
    totalValue: portfolio.totalValue,
    cash: portfolio.cash,
    positionsValue: portfolio.positionsValue,
    totalReturn,
    totalReturnPct,
    ytdReturn,
    oneYearReturn,
    sharpeRatio,
    maxDrawdown,
    winRate: null,
    totalTrades: trades.length,
    lastTradeAt: trades[0]?.executedAt?.toISOString() ?? null,
  };
}

export async function getLeaderboard(
  sortBy: string = "totalReturn",
  limit: number = 50
): Promise<AgentPerformance[]> {
  // Batch fetch: all agents + portfolios + positions in 2 queries
  const agents = await prisma.agent.findMany({
    where: { isActive: true },
    select: { id: true, name: true, createdAt: true },
    take: Math.min(limit, 100),
  });

  if (agents.length === 0) return [];

  const agentIds = agents.map((a) => a.id);

  // 3 parallel batch queries instead of N+1
  const [portfolios, allSnapshots, allTrades] = await Promise.all([
    prisma.portfolio.findMany({
      where: { agentId: { in: agentIds } },
      include: { positions: true },
    }),
    prisma.portfolioSnapshot.findMany({
      where: { agentId: { in: agentIds } },
      orderBy: { date: "asc" },
    }),
    prisma.trade.findMany({
      where: { agentId: { in: agentIds }, status: "filled" },
      orderBy: { executedAt: "desc" },
    }),
  ]);

  // Index by agentId
  const portfolioMap = new Map(portfolios.map((p) => [p.agentId, p]));

  const snapshotMap = new Map<string, typeof allSnapshots>();
  for (const s of allSnapshots) {
    if (!snapshotMap.has(s.agentId)) snapshotMap.set(s.agentId, []);
    snapshotMap.get(s.agentId)!.push(s);
  }

  const tradeMap = new Map<string, typeof allTrades>();
  for (const t of allTrades) {
    if (!tradeMap.has(t.agentId)) tradeMap.set(t.agentId, []);
    tradeMap.get(t.agentId)!.push(t);
  }

  // Single batch quote for ALL symbols across ALL portfolios
  const allSymbols = new Set<string>();
  for (const p of portfolios) {
    for (const pos of p.positions) {
      allSymbols.add(pos.symbol);
    }
  }
  const quotes = allSymbols.size > 0 ? await getBatchQuotes(Array.from(allSymbols)) : {};

  // Calculate performance from pre-fetched data (zero additional queries)
  const performances: AgentPerformance[] = agents.map((agent) => {
    const portfolio = portfolioMap.get(agent.id);
    const snapshots = snapshotMap.get(agent.id) || [];
    const trades = tradeMap.get(agent.id) || [];

    if (!portfolio) {
      return {
        agentId: agent.id,
        agentName: agent.name,
        totalValue: INITIAL_PORTFOLIO_VALUE,
        cash: INITIAL_PORTFOLIO_VALUE,
        positionsValue: 0,
        totalReturn: 0,
        totalReturnPct: 0,
        ytdReturn: null,
        oneYearReturn: null,
        sharpeRatio: null,
        maxDrawdown: null,
        winRate: null,
        totalTrades: 0,
        lastTradeAt: null,
      };
    }

    const cash = Number(portfolio.cash);
    let positionsValue = 0;

    for (const pos of portfolio.positions) {
      const quote = quotes[pos.symbol];
      const currentPrice = quote?.price ?? Number(pos.avgCostBasis);
      positionsValue += currentPrice * pos.quantity;
    }

    const totalValue = cash + positionsValue;
    const totalReturn = totalValue - INITIAL_PORTFOLIO_VALUE;
    const totalReturnPct = (totalReturn / INITIAL_PORTFOLIO_VALUE) * 100;

    const { ytdReturn, oneYearReturn, sharpeRatio, maxDrawdown } = calculateSnapshotMetrics(
      snapshots,
      totalValue
    );

    return {
      agentId: agent.id,
      agentName: agent.name,
      totalValue,
      cash,
      positionsValue,
      totalReturn,
      totalReturnPct,
      ytdReturn,
      oneYearReturn,
      sharpeRatio,
      maxDrawdown,
      winRate: null,
      totalTrades: trades.length,
      lastTradeAt: trades[0]?.executedAt?.toISOString() ?? null,
    };
  });

  // Sort
  performances.sort((a, b) => {
    switch (sortBy) {
      case "totalReturn":
        return b.totalReturnPct - a.totalReturnPct;
      case "sharpe":
        return (b.sharpeRatio ?? -999) - (a.sharpeRatio ?? -999);
      case "trades":
        return b.totalTrades - a.totalTrades;
      default:
        return b.totalReturnPct - a.totalReturnPct;
    }
  });

  return performances.slice(0, limit);
}

// Shared helper for snapshot-based metrics
function calculateSnapshotMetrics(
  snapshots: { date: Date; totalValue: unknown; dailyReturn: unknown }[],
  currentTotalValue: number
) {
  let ytdReturn: number | null = null;
  let oneYearReturn: number | null = null;
  let sharpeRatio: number | null = null;
  let maxDrawdown: number | null = null;

  if (snapshots.length === 0) {
    return { ytdReturn, oneYearReturn, sharpeRatio, maxDrawdown };
  }

  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const ytdSnapshot = snapshots.find((s) => new Date(s.date) >= startOfYear);
  if (ytdSnapshot) {
    const ytdStartValue = Number(ytdSnapshot.totalValue);
    ytdReturn = ((currentTotalValue - ytdStartValue) / ytdStartValue) * 100;
  }

  const yearSnapshot = snapshots.find((s) => new Date(s.date) >= oneYearAgo);
  if (yearSnapshot) {
    const yearStartValue = Number(yearSnapshot.totalValue);
    oneYearReturn = ((currentTotalValue - yearStartValue) / yearStartValue) * 100;
  }

  if (snapshots.length >= 2) {
    const dailyReturns = snapshots
      .filter((s) => s.dailyReturn !== null)
      .map((s) => Number(s.dailyReturn));

    if (dailyReturns.length > 0) {
      const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
      const stdDev = Math.sqrt(
        dailyReturns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / dailyReturns.length
      );
      const dailyRiskFree = RISK_FREE_RATE / 252;
      sharpeRatio = stdDev > 0 ? ((avgReturn - dailyRiskFree) / stdDev) * Math.sqrt(252) : 0;
    }
  }

  let peak = 0;
  let maxDd = 0;
  for (const s of snapshots) {
    const val = Number(s.totalValue);
    if (val > peak) peak = val;
    const dd = (peak - val) / peak;
    if (dd > maxDd) maxDd = dd;
  }
  maxDrawdown = maxDd * 100;

  return { ytdReturn, oneYearReturn, sharpeRatio, maxDrawdown };
}
