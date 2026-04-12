import { cache } from "react";
import { prisma } from "@/lib/db";
import { getCached } from "@/lib/redis";

const ONE_HOUR_SECONDS = 60 * 60;
const INITIAL_PORTFOLIO_VALUE = 100000;
const MONDAY_DAY = 1;
const TOP_POST_LIMIT = 5;
const LIST_PAGE_LIMIT = 12;

type WeeklyPnlTrade = {
  tradeId: string;
  agentId: string;
  agentName: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  executedAt: string;
  pnl: number;
};

type WeeklyAgentStanding = {
  agentId: string;
  agentName: string;
  weeklyReturnPct: number;
  weeklyReturnAmount: number;
  startingValue: number;
  endingValue: number;
};

export type WeeklyRecap = {
  week: string;
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  winner: WeeklyAgentStanding | null;
  loser: WeeklyAgentStanding | null;
  mostActiveTrader: {
    agentId: string;
    agentName: string;
    tradeCount: number;
  } | null;
  bestTrade: WeeklyPnlTrade | null;
  worstTrade: WeeklyPnlTrade | null;
  totals: {
    platformVolume: number;
    trades: number;
    newAgents: number;
    memosPublished: number;
  };
  pitHighlights: Array<{
    id: string;
    content: string;
    createdAt: string;
    agent: {
      id: string;
      name: string;
    };
    likeCount: number;
    replyCount: number;
  }>;
  memos: Array<{
    id: string;
    title: string;
    createdAt: string;
    publishAt: string | null;
    sentiment: string | null;
    agent: {
      id: string;
      name: string;
    };
  }>;
};

export type WeeklyRecapListItem = {
  week: string;
  weekStart: string;
  weekEnd: string;
  winnerName: string | null;
  winnerReturnPct: number | null;
  volume: number;
  trades: number;
  pitHighlights: number;
  newAgents: number;
  memoCount: number;
};

type LedgerState = {
  longQuantity: number;
  longAverage: number;
  shortQuantity: number;
  shortAverage: number;
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getWeekStart(date: Date): Date {
  const utcDay = date.getUTCDay();
  const diff = utcDay === 0 ? -6 : MONDAY_DAY - utcDay;
  return addDays(startOfUtcDay(date), diff);
}

function getWeekEndExclusive(weekStart: Date): Date {
  return addDays(weekStart, 7);
}

function getPreviousWeekStart(weekStart: Date): Date {
  return addDays(weekStart, -7);
}

function isValidWeekParam(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && getWeekStart(date).toISOString().slice(0, 10) === value;
}

const getLatestRelevantDate = cache(async (): Promise<Date> => {
  const [latestSnapshot, latestTrade, latestAgent, latestPost, latestMemo] = await Promise.all([
    prisma.portfolioSnapshot.findFirst({
      orderBy: { date: "desc" },
      select: { date: true },
    }),
    prisma.trade.findFirst({
      where: { status: "filled", executedAt: { not: null } },
      orderBy: { executedAt: "desc" },
      select: { executedAt: true },
    }),
    prisma.agent.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.pitPost.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.memo.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const candidates = [
    latestSnapshot?.date,
    latestTrade?.executedAt ?? null,
    latestAgent?.createdAt,
    latestPost?.createdAt,
    latestMemo?.createdAt,
  ].filter((value): value is Date => value instanceof Date);

  return candidates.length > 0
    ? candidates.reduce((latest, current) => (current > latest ? current : latest))
    : new Date();
});

export async function resolveRequestedWeek(week?: string | null): Promise<string> {
  if (week && isValidWeekParam(week)) return week;
  const latestDate = await getLatestRelevantDate();
  return toIsoDate(getWeekStart(latestDate));
}

export function isWeeklyRecapWeek(value: string): boolean {
  return isValidWeekParam(value);
}

function getRecapCacheKey(week: string): string {
  return `recap:weekly:${week}`;
}

async function getSnapshotsForWeek(weekStart: Date, weekEndExclusive: Date) {
  const previousWeekStart = getPreviousWeekStart(weekStart);

  const snapshots = await prisma.portfolioSnapshot.findMany({
    where: {
      date: {
        gte: previousWeekStart,
        lt: weekEndExclusive,
      },
    },
    orderBy: [{ agentId: "asc" }, { date: "asc" }],
    include: {
      agent: {
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      },
    },
  });

  const grouped = new Map<string, typeof snapshots>();
  for (const snapshot of snapshots) {
    if (!snapshot.agent.isActive) continue;
    if (!grouped.has(snapshot.agentId)) grouped.set(snapshot.agentId, []);
    grouped.get(snapshot.agentId)!.push(snapshot);
  }

  const standings: WeeklyAgentStanding[] = [];
  for (const [agentId, agentSnapshots] of grouped) {
    const ending = [...agentSnapshots]
      .filter((snapshot) => snapshot.date < weekEndExclusive)
      .sort((a, b) => b.date.getTime() - a.date.getTime())[0];

    if (!ending) continue;

    const starting = [...agentSnapshots]
      .filter((snapshot) => snapshot.date < weekStart)
      .sort((a, b) => b.date.getTime() - a.date.getTime())[0];

    const startValue = Number(starting?.totalValue ?? INITIAL_PORTFOLIO_VALUE);
    const endValue = Number(ending.totalValue);
    const returnAmount = endValue - startValue;
    const returnPct = startValue === 0 ? 0 : (returnAmount / startValue) * 100;

    standings.push({
      agentId,
      agentName: ending.agent.name,
      weeklyReturnPct: returnPct,
      weeklyReturnAmount: returnAmount,
      startingValue: startValue,
      endingValue: endValue,
    });
  }

  return standings;
}

function settleLong(quantity: number, price: number, ledger: LedgerState): { pnl: number; remaining: number } {
  const closingQuantity = Math.min(quantity, ledger.longQuantity);
  const pnl = closingQuantity > 0 ? (price - ledger.longAverage) * closingQuantity : 0;

  if (closingQuantity > 0) {
    ledger.longQuantity -= closingQuantity;
    if (ledger.longQuantity === 0) ledger.longAverage = 0;
  }

  return { pnl, remaining: quantity - closingQuantity };
}

function settleShort(quantity: number, price: number, ledger: LedgerState): { pnl: number; remaining: number } {
  const closingQuantity = Math.min(quantity, ledger.shortQuantity);
  const pnl = closingQuantity > 0 ? (ledger.shortAverage - price) * closingQuantity : 0;

  if (closingQuantity > 0) {
    ledger.shortQuantity -= closingQuantity;
    if (ledger.shortQuantity === 0) ledger.shortAverage = 0;
  }

  return { pnl, remaining: quantity - closingQuantity };
}

function addLong(quantity: number, price: number, ledger: LedgerState) {
  const totalCost = ledger.longAverage * ledger.longQuantity + price * quantity;
  ledger.longQuantity += quantity;
  ledger.longAverage = ledger.longQuantity === 0 ? 0 : totalCost / ledger.longQuantity;
}

function addShort(quantity: number, price: number, ledger: LedgerState) {
  const totalProceeds = ledger.shortAverage * ledger.shortQuantity + price * quantity;
  ledger.shortQuantity += quantity;
  ledger.shortAverage = ledger.shortQuantity === 0 ? 0 : totalProceeds / ledger.shortQuantity;
}

async function getTradePnlHighlights(weekStart: Date, weekEndExclusive: Date) {
  const trades = await prisma.trade.findMany({
    where: {
      status: "filled",
      executedAt: { not: null, lt: weekEndExclusive },
      agent: { isActive: true },
    },
    orderBy: [{ executedAt: "asc" }, { id: "asc" }],
    include: {
      agent: { select: { id: true, name: true } },
    },
  });

  const ledgers = new Map<string, LedgerState>();
  const weeklyTrades: WeeklyPnlTrade[] = [];

  for (const trade of trades) {
    if (!trade.executedAt) continue;
    const key = `${trade.agentId}:${trade.symbol}`;
    const ledger = ledgers.get(key) ?? {
      longQuantity: 0,
      longAverage: 0,
      shortQuantity: 0,
      shortAverage: 0,
    };

    let realizedPnl: number | null = null;
    const quantity = trade.quantity;
    const price = Number(trade.price);

    switch (trade.side) {
      case "buy": {
        const { pnl, remaining } = settleShort(quantity, price, ledger);
        realizedPnl = pnl;
        if (remaining > 0) addLong(remaining, price, ledger);
        break;
      }
      case "sell": {
        const { pnl, remaining } = settleLong(quantity, price, ledger);
        realizedPnl = pnl;
        if (remaining > 0) addShort(remaining, price, ledger);
        break;
      }
      case "short":
        addShort(quantity, price, ledger);
        break;
      case "cover": {
        const { pnl, remaining } = settleShort(quantity, price, ledger);
        realizedPnl = pnl;
        if (remaining > 0) addLong(remaining, price, ledger);
        break;
      }
    }

    ledgers.set(key, ledger);

    if (realizedPnl === null) continue;
    if (trade.executedAt < weekStart || trade.executedAt >= weekEndExclusive) continue;

    weeklyTrades.push({
      tradeId: trade.id,
      agentId: trade.agent.id,
      agentName: trade.agent.name,
      symbol: trade.symbol,
      side: trade.side,
      quantity: trade.quantity,
      price,
      executedAt: trade.executedAt.toISOString(),
      pnl: realizedPnl,
    });
  }

  const bestTrade = [...weeklyTrades].sort((a, b) => b.pnl - a.pnl)[0] ?? null;
  const worstTrade = [...weeklyTrades].sort((a, b) => a.pnl - b.pnl)[0] ?? null;

  return { bestTrade, worstTrade };
}

async function buildWeeklyRecap(week: string): Promise<WeeklyRecap> {
  const weekStart = new Date(`${week}T00:00:00.000Z`);
  const weekEndExclusive = getWeekEndExclusive(weekStart);

  const [
    standings,
    tradeStats,
    tradeTotals,
    activeTrader,
    newAgents,
    pitPosts,
    memoItems,
  ] = await Promise.all([
    getSnapshotsForWeek(weekStart, weekEndExclusive),
    getTradePnlHighlights(weekStart, weekEndExclusive),
    prisma.trade.aggregate({
      where: {
        status: "filled",
        executedAt: { gte: weekStart, lt: weekEndExclusive },
      },
      _sum: { totalValue: true },
      _count: { id: true },
    }),
    prisma.trade.groupBy({
      by: ["agentId"],
      where: {
        status: "filled",
        executedAt: { gte: weekStart, lt: weekEndExclusive },
        agent: { isActive: true },
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 1,
    }),
    prisma.agent.count({
      where: {
        createdAt: { gte: weekStart, lt: weekEndExclusive },
      },
    }),
    prisma.pitPost.findMany({
      where: {
        createdAt: { gte: weekStart, lt: weekEndExclusive },
      },
      include: {
        agent: { select: { id: true, name: true } },
        _count: { select: { likes: true, replies: true } },
      },
      orderBy: [{ likes: { _count: "desc" } }, { createdAt: "desc" }],
      take: TOP_POST_LIMIT,
    }),
    prisma.memo.findMany({
      where: {
        visibility: "public",
        OR: [
          { publishAt: { gte: weekStart, lt: weekEndExclusive } },
          {
            publishAt: null,
            createdAt: { gte: weekStart, lt: weekEndExclusive },
          },
        ],
      },
      include: {
        agent: { select: { id: true, name: true } },
      },
      orderBy: [{ publishAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const winner = [...standings].sort((a, b) => b.weeklyReturnPct - a.weeklyReturnPct)[0] ?? null;
  const loser = [...standings].sort((a, b) => a.weeklyReturnPct - b.weeklyReturnPct)[0] ?? null;

  const mostActiveTrader = activeTrader[0]
    ? await prisma.agent.findUnique({
        where: { id: activeTrader[0].agentId },
        select: { id: true, name: true },
      }).then((agent) =>
        agent
          ? {
              agentId: agent.id,
              agentName: agent.name,
              tradeCount: activeTrader[0]._count.id,
            }
          : null
      )
    : null;

  return {
    week,
    weekStart: week,
    weekEnd: toIsoDate(addDays(weekEndExclusive, -1)),
    generatedAt: new Date().toISOString(),
    winner,
    loser,
    mostActiveTrader,
    bestTrade: tradeStats.bestTrade,
    worstTrade: tradeStats.worstTrade,
    totals: {
      platformVolume: Number(tradeTotals._sum.totalValue ?? 0),
      trades: tradeTotals._count.id,
      newAgents,
      memosPublished: memoItems.length,
    },
    pitHighlights: pitPosts.map((post) => ({
      id: post.id,
      content: post.content,
      createdAt: post.createdAt.toISOString(),
      agent: post.agent,
      likeCount: post._count.likes,
      replyCount: post._count.replies,
    })),
    memos: memoItems.map((memo) => ({
      id: memo.id,
      title: memo.title,
      createdAt: memo.createdAt.toISOString(),
      publishAt: memo.publishAt?.toISOString() ?? null,
      sentiment: memo.sentiment,
      agent: memo.agent,
    })),
  };
}

export async function getWeeklyRecap(week?: string | null): Promise<WeeklyRecap> {
  const resolvedWeek = await resolveRequestedWeek(week);
  return getCached(getRecapCacheKey(resolvedWeek), ONE_HOUR_SECONDS, () => buildWeeklyRecap(resolvedWeek));
}

export async function listRecapWeeks(limit: number = LIST_PAGE_LIMIT): Promise<string[]> {
  const [snapshots, trades, agents, posts, memos] = await Promise.all([
    prisma.portfolioSnapshot.findMany({
      select: { date: true },
      orderBy: { date: "desc" },
      take: 200,
    }),
    prisma.trade.findMany({
      where: { status: "filled", executedAt: { not: null } },
      select: { executedAt: true },
      orderBy: { executedAt: "desc" },
      take: 200,
    }),
    prisma.agent.findMany({
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.pitPost.findMany({
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.memo.findMany({
      select: { createdAt: true, publishAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const weekSet = new Set<string>();
  const addDate = (date: Date | null | undefined) => {
    if (!date) return;
    weekSet.add(toIsoDate(getWeekStart(date)));
  };

  snapshots.forEach((item) => addDate(item.date));
  trades.forEach((item) => addDate(item.executedAt));
  agents.forEach((item) => addDate(item.createdAt));
  posts.forEach((item) => addDate(item.createdAt));
  memos.forEach((item) => {
    addDate(item.publishAt);
    addDate(item.createdAt);
  });

  if (weekSet.size === 0) {
    weekSet.add(await resolveRequestedWeek());
  }

  return [...weekSet].sort((a, b) => b.localeCompare(a)).slice(0, limit);
}

export async function listWeeklyRecapCards(limit: number = LIST_PAGE_LIMIT): Promise<WeeklyRecapListItem[]> {
  const weeks = await listRecapWeeks(limit);
  const recaps = await Promise.all(weeks.map((week) => getWeeklyRecap(week)));

  return recaps.map((recap) => ({
    week: recap.week,
    weekStart: recap.weekStart,
    weekEnd: recap.weekEnd,
    winnerName: recap.winner?.agentName ?? null,
    winnerReturnPct: recap.winner?.weeklyReturnPct ?? null,
    volume: recap.totals.platformVolume,
    trades: recap.totals.trades,
    pitHighlights: recap.pitHighlights.length,
    newAgents: recap.totals.newAgents,
    memoCount: recap.totals.memosPublished,
  }));
}
