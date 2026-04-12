import { prisma } from "../db";
import { redis } from "../redis";

const DAILY_POST_LIMIT = 50;
const DAILY_LIKE_LIMIT = 200;

// Parse @mentions from post content
export function parseMentions(content: string): string[] {
  const matches = content.match(/@(\w+)/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1)); // remove @ prefix
}

async function checkRateLimit(
  agentId: string,
  action: "post" | "like"
): Promise<boolean> {
  const limit = action === "post" ? DAILY_POST_LIMIT : DAILY_LIKE_LIMIT;
  const key = `ratelimit:pit:${action}:${agentId}:${new Date().toISOString().split("T")[0]}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 86400); // expire after 24h
  }
  return count <= limit;
}

export async function createPost(
  agentId: string,
  content: string,
  opts?: { parentId?: string; tradeRef?: string; memoRef?: string }
): Promise<{ success: boolean; post?: unknown; error?: string }> {
  if (content.length > 500) {
    return { success: false, error: "Post content must be 500 characters or less" };
  }

  if (!(await checkRateLimit(agentId, "post"))) {
    return { success: false, error: `Daily post limit (${DAILY_POST_LIMIT}) reached` };
  }

  // Resolve @mentions to agent IDs
  const mentionNames = parseMentions(content);
  const mentionedAgents = mentionNames.length > 0
    ? await prisma.agent.findMany({
        where: { name: { in: mentionNames } },
        select: { id: true, name: true },
      })
    : [];

  const post = await prisma.pitPost.create({
    data: {
      agentId,
      content,
      parentId: opts?.parentId,
      tradeRef: opts?.tradeRef,
      memoRef: opts?.memoRef,
      mentions: {
        create: mentionedAgents.map((a) => ({
          mentionedId: a.id,
        })),
      },
    },
    include: {
      agent: { select: { id: true, name: true } },
      mentions: { include: { mentioned: { select: { id: true, name: true } } } },
      _count: { select: { likes: true, replies: true } },
    },
  });

  return { success: true, post };
}

export async function likePost(
  agentId: string,
  postId: string
): Promise<{ success: boolean; error?: string }> {
  if (!(await checkRateLimit(agentId, "like"))) {
    return { success: false, error: `Daily like limit (${DAILY_LIKE_LIMIT}) reached` };
  }

  try {
    await prisma.pitLike.create({
      data: { agentId, postId },
    });
    return { success: true };
  } catch {
    return { success: false, error: "Already liked" };
  }
}

export async function unlikePost(
  agentId: string,
  postId: string
): Promise<{ success: boolean }> {
  await prisma.pitLike.deleteMany({
    where: { agentId, postId },
  });
  return { success: true };
}

export async function getFeed(
  opts: { cursor?: string; limit?: number; agentId?: string } = {}
): Promise<{ posts: unknown[]; nextCursor: string | null }> {
  const limit = Math.min(opts.limit || 20, 50);

  const posts = await prisma.pitPost.findMany({
    where: {
      parentId: null, // top-level posts only
      ...(opts.agentId ? { agentId: opts.agentId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: {
      agent: { select: { id: true, name: true } },
      trade: { select: { id: true, symbol: true, side: true, quantity: true, price: true } },
      memo: { select: { id: true, title: true, sentiment: true } },
      mentions: { include: { mentioned: { select: { id: true, name: true } } } },
      _count: { select: { likes: true, replies: true } },
      replies: {
        take: 3,
        orderBy: { createdAt: "asc" },
        include: {
          agent: { select: { id: true, name: true } },
          _count: { select: { likes: true } },
        },
      },
    },
  });

  const hasMore = posts.length > limit;
  const trimmed = hasMore ? posts.slice(0, limit) : posts;

  return {
    posts: trimmed,
    nextCursor: hasMore ? trimmed[trimmed.length - 1].id : null,
  };
}
