/**
 * Nightly portfolio snapshot job.
 * Run at 4:30 PM ET after market close.
 * Usage: npx tsx scripts/snapshot.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const YFINANCE_URL = process.env.YFINANCE_URL || "http://localhost:8100";
const INITIAL_VALUE = 100000;

async function getPrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(`${YFINANCE_URL}/quote/${symbol}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.price;
  } catch {
    return null;
  }
}

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const agents = await prisma.agent.findMany({
    where: { isActive: true },
    include: {
      portfolio: { include: { positions: true } },
    },
  });

  console.log(`Taking snapshots for ${agents.length} agents...`);

  for (const agent of agents) {
    if (!agent.portfolio) continue;

    const cash = Number(agent.portfolio.cash);
    let positionsValue = 0;
    const positionBreakdown: Record<string, unknown>[] = [];

    for (const pos of agent.portfolio.positions) {
      const price = await getPrice(pos.symbol);
      const currentPrice = price ?? Number(pos.avgCostBasis);
      const value = currentPrice * pos.quantity;
      positionsValue += value;

      positionBreakdown.push({
        symbol: pos.symbol,
        side: pos.side,
        quantity: pos.quantity,
        price: currentPrice,
        value,
        costBasis: Number(pos.avgCostBasis) * pos.quantity,
      });
    }

    const totalValue = cash + positionsValue;

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

    // Calculate rolling Sharpe (use all snapshots)
    const allSnapshots = await prisma.portfolioSnapshot.findMany({
      where: { agentId: agent.id },
      orderBy: { date: "asc" },
      take: 252, // last year
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
      const dailyRiskFree = 0.05 / 252;
      sharpeRatio =
        stdDev > 0 ? ((avg - dailyRiskFree) / stdDev) * Math.sqrt(252) : 0;
    }

    await prisma.portfolioSnapshot.upsert({
      where: {
        agentId_date: { agentId: agent.id, date: today },
      },
      update: {
        totalValue: Number(totalValue),
        cash: Number(cash),
        positionsValue: Number(positionsValue),
        dailyReturn: Number(dailyReturn),
        cumulativeReturn: Number(cumulativeReturn),
        sharpeRatio: sharpeRatio !== null ? Number(sharpeRatio) : null,
        snapshot: JSON.parse(JSON.stringify(positionBreakdown)),
      },
      create: {
        agentId: agent.id,
        date: today,
        totalValue: Number(totalValue),
        cash: Number(cash),
        positionsValue: Number(positionsValue),
        dailyReturn: Number(dailyReturn),
        cumulativeReturn: Number(cumulativeReturn),
        sharpeRatio: sharpeRatio !== null ? Number(sharpeRatio) : null,
        snapshot: JSON.parse(JSON.stringify(positionBreakdown)),
      },
    });

    console.log(
      `  ${agent.name}: $${totalValue.toFixed(2)} (${(cumulativeReturn * 100).toFixed(2)}%)`
    );
  }

  console.log("Done.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
