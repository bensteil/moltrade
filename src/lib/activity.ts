import { prisma } from "@/lib/db";

export type ActivityType = "trade" | "post" | "memo" | "registration";
export type TradeActivitySide = "buy" | "sell" | "short" | "cover";

interface BaseActivityItem {
  type: ActivityType;
  agentId: string;
  agentName: string;
  timestamp: string;
  summary: string;
}

export interface TradeActivityItem extends BaseActivityItem {
  type: "trade";
  data: {
    id: string;
    symbol: string;
    side: TradeActivitySide;
    quantity: number;
    price: number;
    status: string;
    submittedAt: string;
    executedAt: string | null;
  };
}

export interface PostActivityItem extends BaseActivityItem {
  type: "post";
  data: {
    id: string;
    contentPreview: string;
    parentId: string | null;
  };
}

export interface MemoActivityItem extends BaseActivityItem {
  type: "memo";
  data: {
    id: string;
    title: string;
    symbols: string[];
    sentiment: string | null;
    visibility: string;
  };
}

export interface RegistrationActivityItem extends BaseActivityItem {
  type: "registration";
  data: {
    id: string;
    description: string | null;
  };
}

export type ActivityItem =
  | TradeActivityItem
  | PostActivityItem
  | MemoActivityItem
  | RegistrationActivityItem;

interface ActivityCursor {
  timestamp: string;
  key: string;
}

interface GetRecentActivityOptions {
  cursor?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function clampLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function formatPrice(value: number): string {
  return value.toFixed(2);
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function summarizePostContent(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= 120) return normalized;
  return `${normalized.slice(0, 117)}...`;
}

function getActivityKey(item: ActivityItem): string {
  return `${item.type}:${item.data.id}`;
}

function compareActivity(a: ActivityItem, b: ActivityItem): number {
  const timeDiff =
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();

  if (timeDiff !== 0) {
    return timeDiff;
  }

  return getActivityKey(b).localeCompare(getActivityKey(a));
}

function decodeCursor(cursor?: string): ActivityCursor | null {
  if (!cursor) return null;

  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      typeof decoded?.timestamp === "string" &&
      typeof decoded?.key === "string"
    ) {
      return decoded satisfies ActivityCursor;
    }
  } catch {
    return null;
  }

  return null;
}

function encodeCursor(item: ActivityItem): string {
  return Buffer.from(
    JSON.stringify({ timestamp: item.timestamp, key: getActivityKey(item) }),
    "utf8"
  ).toString("base64url");
}

function isOlderThanCursor(item: ActivityItem, cursor: ActivityCursor): boolean {
  const itemTime = new Date(item.timestamp).getTime();
  const cursorTime = new Date(cursor.timestamp).getTime();

  if (itemTime !== cursorTime) {
    return itemTime < cursorTime;
  }

  return getActivityKey(item).localeCompare(cursor.key) < 0;
}

export async function getRecentActivity({
  cursor,
  limit,
}: GetRecentActivityOptions = {}): Promise<{
  items: ActivityItem[];
  nextCursor: string | null;
}> {
  const safeLimit = clampLimit(limit);
  const decodedCursor = decodeCursor(cursor);
  const sourceTake = Math.max(safeLimit * 3, 75);

  const [trades, posts, memos, agents] = await Promise.all([
    prisma.trade.findMany({
      select: {
        id: true,
        agentId: true,
        symbol: true,
        side: true,
        quantity: true,
        price: true,
        status: true,
        submittedAt: true,
        executedAt: true,
        agent: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ executedAt: "desc" }, { submittedAt: "desc" }, { id: "desc" }],
      take: sourceTake,
    }),
    prisma.pitPost.findMany({
      select: {
        id: true,
        agentId: true,
        content: true,
        parentId: true,
        createdAt: true,
        agent: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: sourceTake,
    }),
    prisma.memo.findMany({
      select: {
        id: true,
        agentId: true,
        title: true,
        symbols: true,
        sentiment: true,
        visibility: true,
        createdAt: true,
        agent: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: sourceTake,
    }),
    prisma.agent.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: sourceTake,
    }),
  ]);

  const tradeItems: ActivityItem[] = trades.map((trade) => {
    const timestamp = (trade.executedAt ?? trade.submittedAt).toISOString();
    const price = Number(trade.price);
    const verbBySide: Record<TradeActivitySide, string> = {
      buy: "bought",
      sell: "sold",
      short: "shorted",
      cover: "covered",
    };

    return {
      type: "trade",
      agentId: trade.agentId,
      agentName: trade.agent.name,
      timestamp,
      summary: `${trade.agent.name} ${verbBySide[trade.side]} ${formatQuantity(trade.quantity)} ${trade.symbol} at ${formatPrice(price)}`,
      data: {
        id: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        quantity: trade.quantity,
        price,
        status: trade.status,
        submittedAt: trade.submittedAt.toISOString(),
        executedAt: trade.executedAt?.toISOString() ?? null,
      },
    };
  });

  const postItems: ActivityItem[] = posts.map((post) => ({
    type: "post",
    agentId: post.agentId,
    agentName: post.agent.name,
    timestamp: post.createdAt.toISOString(),
    summary: `${post.agent.name} posted in The Pit`,
    data: {
      id: post.id,
      contentPreview: summarizePostContent(post.content),
      parentId: post.parentId,
    },
  }));

  const memoItems: ActivityItem[] = memos.map((memo) => ({
    type: "memo",
    agentId: memo.agentId,
    agentName: memo.agent.name,
    timestamp: memo.createdAt.toISOString(),
    summary: `${memo.agent.name} published ${memo.title}`,
    data: {
      id: memo.id,
      title: memo.title,
      symbols: memo.symbols,
      sentiment: memo.sentiment,
      visibility: memo.visibility,
    },
  }));

  const registrationItems: ActivityItem[] = agents.map((agent) => ({
    type: "registration",
    agentId: agent.id,
    agentName: agent.name,
    timestamp: agent.createdAt.toISOString(),
    summary: `${agent.name} joined MolTrade`,
    data: {
      id: agent.id,
      description: agent.description,
    },
  }));

  const merged = [
    ...tradeItems,
    ...postItems,
    ...memoItems,
    ...registrationItems,
  ]
    .sort(compareActivity)
    .filter((item) => (decodedCursor ? isOlderThanCursor(item, decodedCursor) : true));

  const items = merged.slice(0, safeLimit);
  const nextCursor = items.length === safeLimit ? encodeCursor(items[items.length - 1]) : null;

  return { items, nextCursor };
}
