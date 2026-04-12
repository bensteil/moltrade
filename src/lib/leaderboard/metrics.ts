import { prisma } from "../db";
import { getQuote } from "../market/cache";

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
  let positionsValue = 0;
  const positionDetails: { symbol: string; side: string; quantity: number; marketValue: number; costBasis: number; pnl: number }[] = [];

  for (const pos of portfolio.positions) {
    const quote = await getQuote(pos.symbol);
    const currentPrice = quote?.price ?? Number(pos.avgCostBasis);
    const costBasis = Number(pos.avgCostBasis) * pos.quantity;
    let marketValue: number;
    let pnl: number;

    if (pos.side === "long") {
      marketValue = currentPrice * pos.quantity;
      pnl = marketValue - costBasis;
    } else {
      // Short: value is the margin held, P&L is inverse
      marketValue = currentPrice * pos.quantity;
      pnl = costBasis - marketValue; // profit when price drops
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

  // Get snapshots for time-based returns
  const snapshots = await prisma.portfolioSnapshot.findMany({
    where: { agentId },
    orderBy: { date: "asc" },
  });

  let ytdReturn: number | null = null;
  let oneYearReturn: number | null = null;
  let sharpeRatio: number | null = null;
  let maxDrawdown: number | null = null;

  if (snapshots.length > 0) {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    // YTD
    const ytdSnapshot = snapshots.find(
      (s) => new Date(s.date) >= startOfYear
    );
    if (ytdSnapshot) {
      const ytdStartValue = Number(ytdSnapshot.totalValue);
      ytdReturn = ((portfolio.totalValue - ytdStartValue) / ytdStartValue) * 100;
    }

    // 1Y
    const yearSnapshot = snapshots.find(
      (s) => new Date(s.date) >= oneYearAgo
    );
    if (yearSnapshot) {
      const yearStartValue = Number(yearSnapshot.totalValue);
      oneYearReturn = ((portfolio.totalValue - yearStartValue) / yearStartValue) * 100;
    }

    // Sharpe ratio (annualized)
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

    // Max drawdown
    let peak = 0;
    let maxDd = 0;
    for (const s of snapshots) {
      const val = Number(s.totalValue);
      if (val > peak) peak = val;
      const dd = (peak - val) / peak;
      if (dd > maxDd) maxDd = dd;
    }
    maxDrawdown = maxDd * 100;
  }

  // Win rate
  const trades = await prisma.trade.findMany({
    where: { agentId, status: "filled" },
    orderBy: { executedAt: "desc" },
  });

  let winRate: number | null = null;
  if (trades.length > 0) {
    // Simple win rate: count sells where price > avg cost
    const sells = trades.filter((t) => t.side === "sell" || t.side === "cover");
    if (sells.length > 0) {
      // This is simplified — proper win rate would pair buys with sells
      winRate = null; // TODO: implement proper P&L per closed position
    }
  }

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
    winRate,
    totalTrades: trades.length,
    lastTradeAt: trades[0]?.executedAt?.toISOString() ?? null,
  };
}

export async function getLeaderboard(
  sortBy: string = "totalReturn",
  limit: number = 50
): Promise<AgentPerformance[]> {
  const agents = await prisma.agent.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  const performances = await Promise.all(
    agents.map((a) => getAgentPerformance(a.id))
  );

  const valid = performances.filter((p): p is AgentPerformance => p !== null);

  // Sort
  valid.sort((a, b) => {
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

  return valid.slice(0, limit);
}
