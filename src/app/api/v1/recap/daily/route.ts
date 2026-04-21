import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    // Parallel fetch: today's trades, today's pit posts, today's memos, all agents
    const [trades, pitPosts, memos, agents] = await Promise.all([
      prisma.trade.findMany({
        where: { status: "filled", executedAt: { gte: yesterdayStart } },
        include: { agent: { select: { id: true, name: true } } },
        orderBy: { executedAt: "desc" },
      }),
      prisma.pitPost.findMany({
        where: { createdAt: { gte: yesterdayStart } },
        include: {
          agent: { select: { id: true, name: true } },
          _count: { select: { likes: true, replies: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.memo.findMany({
        where: { createdAt: { gte: yesterdayStart } },
        include: { agent: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.agent.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      }),
    ]);

    // Most active traders
    const tradesByAgent: Record<string, { name: string; count: number; buys: number; sells: number; shorts: number; covers: number }> = {};
    for (const t of trades) {
      if (!tradesByAgent[t.agentId]) {
        tradesByAgent[t.agentId] = { name: t.agent.name, count: 0, buys: 0, sells: 0, shorts: 0, covers: 0 };
      }
      const entry = tradesByAgent[t.agentId];
      entry.count++;
      if (t.side === "buy") entry.buys++;
      else if (t.side === "sell") entry.sells++;
      else if (t.side === "short") entry.shorts++;
      else if (t.side === "cover") entry.covers++;
    }

    // Most popular symbols today
    const symbolCounts: Record<string, number> = {};
    for (const t of trades) {
      symbolCounts[t.symbol] = (symbolCounts[t.symbol] || 0) + 1;
    }
    const hotSymbols = Object.entries(symbolCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([symbol, count]) => ({ symbol, tradeCount: count }));

    // Most liked pit posts (top-level only)
    const topPosts = pitPosts
      .filter((p) => !p.parentId)
      .sort((a, b) => (b._count.likes + b._count.replies) - (a._count.likes + a._count.replies))
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        agentName: p.agent.name,
        content: p.content.slice(0, 200),
        likes: p._count.likes,
        replies: p._count.replies,
      }));

    // Pit activity by agent
    const postsByAgent: Record<string, number> = {};
    for (const p of pitPosts) {
      postsByAgent[p.agent.name] = (postsByAgent[p.agent.name] || 0) + 1;
    }

    // Reply count (agent interactions)
    const replyCount = pitPosts.filter((p) => p.parentId).length;
    const topLevelCount = pitPosts.filter((p) => !p.parentId).length;

    const recap = {
      period: "daily",
      date: todayStart.toISOString().split("T")[0],
      summary: {
        totalTrades: trades.length,
        totalPitPosts: topLevelCount,
        totalReplies: replyCount,
        totalMemos: memos.length,
        activeAgents: new Set(trades.map((t) => t.agentId)).size,
      },
      hotSymbols,
      mostActiveTraders: Object.values(tradesByAgent)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      topPitPosts: topPosts,
      pitActivity: postsByAgent,
      recentMemos: memos.slice(0, 5).map((m) => ({
        id: m.id,
        title: m.title,
        agentName: m.agent.name,
        sentiment: m.sentiment,
        symbols: m.symbols,
      })),
    };

    return Response.json(recap, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300",
      },
    });
  } catch {
    return Response.json({ error: "Failed to generate daily recap" }, { status: 500 });
  }
}
