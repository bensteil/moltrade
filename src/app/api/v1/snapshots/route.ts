import { prisma } from "@/lib/db";
import { calculatePortfolioValue } from "@/lib/leaderboard/metrics";

const INITIAL_VALUE = 100000;
const RISK_FREE_RATE = 0.05;

// POST /api/v1/snapshots — Take daily portfolio snapshots for all agents
// Called by the agent scheduler at 4:30 PM ET
export async function POST() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const agents = await prisma.agent.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  const results: { agent: string; totalValue: number; returnPct: number }[] = [];

  for (const agent of agents) {
    try {
      const portfolio = await calculatePortfolioValue(agent.id);
      const { totalValue, cash, positionsValue, positions } = portfolio;

      // Get previous snapshot for daily return
      const prevSnapshot = await prisma.portfolioSnapshot.findFirst({
        where: { agentId: agent.id },
        orderBy: { date: "desc" },
      });

      const prevValue = prevSnapshot
        ? Number(prevSnapshot.totalValue)
        : INITIAL_VALUE;
      const dailyReturn = (totalValue - prevValue) / prevValue;
      const cumulativeReturn = (totalValue - INITIAL_VALUE) / INITIAL_VALUE;

      // Rolling Sharpe from all snapshots
      const allSnapshots = await prisma.portfolioSnapshot.findMany({
        where: { agentId: agent.id },
        orderBy: { date: "asc" },
        take: 252,
      });

      let sharpeRatio: number | null = null;
      const dailyReturns = allSnapshots
        .filter((s) => s.dailyReturn !== null)
        .map((s) => Number(s.dailyReturn));
      dailyReturns.push(dailyReturn);

      if (dailyReturns.length >= 5) {
        const avg =
          dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
        const stdDev = Math.sqrt(
          dailyReturns.reduce((sum, r) => sum + (r - avg) ** 2, 0) /
            dailyReturns.length
        );
        const dailyRiskFree = RISK_FREE_RATE / 252;
        sharpeRatio =
          stdDev > 0
            ? ((avg - dailyRiskFree) / stdDev) * Math.sqrt(252)
            : 0;
      }

      const positionBreakdown = positions.map((p) => ({
        symbol: p.symbol,
        side: p.side,
        quantity: p.quantity,
        value: p.marketValue,
        costBasis: p.costBasis,
        pnl: p.pnl,
      }));

      await prisma.portfolioSnapshot.upsert({
        where: {
          agentId_date: { agentId: agent.id, date: today },
        },
        update: {
          totalValue,
          cash,
          positionsValue,
          dailyReturn,
          cumulativeReturn,
          sharpeRatio,
          snapshot: JSON.parse(JSON.stringify(positionBreakdown)),
        },
        create: {
          agentId: agent.id,
          date: today,
          totalValue,
          cash,
          positionsValue,
          dailyReturn,
          cumulativeReturn,
          sharpeRatio,
          snapshot: JSON.parse(JSON.stringify(positionBreakdown)),
        },
      });

      results.push({
        agent: agent.name,
        totalValue: Math.round(totalValue * 100) / 100,
        returnPct: Math.round(cumulativeReturn * 10000) / 100,
      });
    } catch (e) {
      results.push({
        agent: agent.name,
        totalValue: 0,
        returnPct: 0,
      });
    }
  }

  return Response.json({
    date: today.toISOString().split("T")[0],
    agents: results.length,
    snapshots: results,
  });
}
