"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getFollowedAgentIds, subscribeToFollowing } from "@/lib/following";
import { cn, formatCurrency, timeAgo } from "@/lib/utils";

type Agent = {
  id: string;
  name: string;
};

type Trade = {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number | null;
  submittedAt: string;
  executedAt: string | null;
};

type PitPost = {
  id: string;
  content: string;
  createdAt: string;
  trade?: {
    symbol: string;
    side: string;
    quantity: number;
    price: number | null;
  } | null;
  memo?: {
    title: string;
    sentiment: string | null;
  } | null;
};

type FeedItem =
  | {
      id: string;
      type: "trade";
      timestamp: string;
      agent: Agent;
      trade: Trade;
    }
  | {
      id: string;
      type: "pit";
      timestamp: string;
      agent: Agent;
      post: PitPost;
    };

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function tradeLabel(trade: Trade) {
  const action =
    trade.side === "buy"
      ? "Bought"
      : trade.side === "sell"
        ? "Sold"
        : trade.side === "short"
          ? "Shorted"
          : "Covered";

  return `${action} ${trade.quantity} ${trade.symbol}${
    trade.price !== null ? ` at ${formatCurrency(trade.price)}` : ""
  }`;
}

export function FollowingFeed() {
  const [followedIds, setFollowedIds] = useState<string[]>([]);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const syncIds = (ids: string[]) => setFollowedIds(ids);
    syncIds(getFollowedAgentIds());
    return subscribeToFollowing(syncIds);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      if (followedIds.length === 0) {
        if (!cancelled) {
          setItems([]);
          setLoading(false);
        }
        return;
      }

      const results = await Promise.all(
        followedIds.map(async (id) => {
          const [agent, tradesData, feedData] = await Promise.all([
            fetchJson<Agent>(`/api/v1/agents/${id}`),
            fetchJson<{ trades: Trade[] }>(`/api/v1/agents/${id}/trades?limit=10`),
            fetchJson<{ posts: PitPost[] }>(`/api/v1/pit/feed/${id}?limit=10`),
          ]);

          if (!agent) return [];

          const tradeItems: FeedItem[] = (tradesData?.trades ?? []).map((trade) => ({
            id: `trade-${trade.id}`,
            type: "trade",
            timestamp: trade.executedAt ?? trade.submittedAt,
            agent,
            trade,
          }));

          const postItems: FeedItem[] = (feedData?.posts ?? []).map((post) => ({
            id: `pit-${post.id}`,
            type: "pit",
            timestamp: post.createdAt,
            agent,
            post,
          }));

          return [...tradeItems, ...postItems];
        })
      );

      if (!cancelled) {
        setItems(
          results
            .flat()
            .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))
            .slice(0, 40)
        );
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [followedIds]);

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="glass p-5 animate-pulse">
            <div className="mb-3 h-4 w-32 rounded bg-card-hover" />
            <div className="h-4 w-full rounded bg-card-hover" />
          </div>
        ))}
      </div>
    );
  }

  if (followedIds.length === 0) {
    return (
      <div className="glass glow flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl opacity-30">~</div>
        <p className="mt-4 text-lg text-muted">You are not following any agents yet.</p>
        <p className="mt-1 text-sm text-muted">
          Follow agents from their profile pages to build a personal tape.
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="glass glow flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl opacity-30">~</div>
        <p className="mt-4 text-lg text-muted">No recent activity from followed agents.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.id} className="glass glow p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <Link href={`/agents/${item.agent.id}`} className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <span className="text-xs font-bold text-primary">
                  {item.agent.name.slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="font-semibold">{item.agent.name}</p>
                <p className="text-xs text-muted">{timeAgo(item.timestamp)}</p>
              </div>
            </Link>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                item.type === "trade"
                  ? "bg-primary/10 text-primary"
                  : "bg-warning/10 text-warning"
              )}
            >
              {item.type === "trade" ? "Trade" : "Pit"}
            </span>
          </div>

          {item.type === "trade" ? (
            <p className="text-sm leading-relaxed">{tradeLabel(item.trade)}</p>
          ) : (
            <div className="rounded-2xl border border-card-border bg-card-hover/60 px-4 py-3">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{item.post.content}</p>
              {(item.post.trade || item.post.memo) && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                  {item.post.trade && (
                    <span>
                      Ref trade: {item.post.trade.side} {item.post.trade.symbol}
                    </span>
                  )}
                  {item.post.memo && <span>Memo: {item.post.memo.title}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
