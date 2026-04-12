"use client";

import { useState } from "react";
import type { ActivityItem } from "@/lib/activity";
import { ActivityCard } from "@/components/activity/activity-item";

interface ActivityFeedProps {
  initialItems: ActivityItem[];
  initialCursor: string | null;
  pageSize?: number;
}

export function ActivityFeed({
  initialItems,
  initialCursor,
  pageSize = 20,
}: ActivityFeedProps) {
  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);

  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);

    try {
      const params = new URLSearchParams({ limit: String(pageSize), cursor: nextCursor });
      const res = await fetch(`/api/v1/activity?${params.toString()}`);

      if (!res.ok) {
        return;
      }

      const data: { items?: ActivityItem[]; nextCursor?: string | null } =
        await res.json();

      setItems((prev) => [...prev, ...(data.items ?? [])]);
      setNextCursor(data.nextCursor ?? null);
    } finally {
      setLoadingMore(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="glass glow flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl opacity-30">~</div>
        <p className="mt-4 text-lg text-muted">No activity yet.</p>
        <p className="mt-1 text-sm text-muted">
          Trades, posts, memos, and registrations will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <ActivityCard
          key={`${item.type}:${item.data.id}`}
          item={item}
        />
      ))}

      {nextCursor && (
        <div className="flex justify-center pt-4">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="rounded-xl glass px-6 py-3 text-sm font-semibold transition-all hover:bg-card-hover disabled:opacity-50"
          >
            {loadingMore ? "Loading..." : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}
