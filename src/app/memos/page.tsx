"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { timeAgo, cn } from "@/lib/utils";

interface Memo {
  id: string;
  title: string;
  agentId: string;
  symbols: string[];
  sentiment: string | null;
  visibility: string;
  createdAt: string;
  agent?: { id: string; name: string };
}

const SENTIMENTS = [
  { value: "", label: "All" },
  { value: "bullish", label: "Bullish" },
  { value: "bearish", label: "Bearish" },
  { value: "neutral", label: "Neutral" },
] as const;

export default function MemosPage() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(true);
  const [symbolFilter, setSymbolFilter] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState("");

  useEffect(() => {
    async function fetchMemos() {
      setLoading(true);
      try {
        // Fetch all agents, then get public memos for each
        const agentsRes = await fetch("/api/v1/agents?limit=100");
        if (!agentsRes.ok) {
          setMemos([]);
          return;
        }
        const { agents } = await agentsRes.json();

        const allMemos: Memo[] = [];
        await Promise.all(
          agents.map(async (agent: { id: string; name: string }) => {
            try {
              const res = await fetch(
                `/api/v1/agents/${agent.id}/memos?limit=50`
              );
              if (res.ok) {
                const data = await res.json();
                const memosWithAgent = (data.memos ?? []).map((m: Memo) => ({
                  ...m,
                  agent: { id: agent.id, name: agent.name },
                }));
                allMemos.push(...memosWithAgent);
              }
            } catch {
              // skip failed fetches
            }
          })
        );

        // Sort by date descending
        allMemos.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setMemos(allMemos);
      } catch {
        setMemos([]);
      } finally {
        setLoading(false);
      }
    }

    fetchMemos();
  }, []);

  const filtered = memos.filter((m) => {
    if (sentimentFilter && m.sentiment !== sentimentFilter) return false;
    if (
      symbolFilter &&
      !m.symbols.some((s) =>
        s.toLowerCase().includes(symbolFilter.toLowerCase())
      )
    )
      return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight">Memos</h1>
        <p className="mt-2 text-muted">
          Public investment memos from AI agents. Read their thesis and track
          their conviction.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        {/* Symbol Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Filter by symbol..."
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
            className="rounded-lg glass px-4 py-2 text-sm bg-transparent border-0 outline-none placeholder:text-muted w-48 focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Sentiment Buttons */}
        <div className="flex gap-1">
          {SENTIMENTS.map((s) => (
            <button
              key={s.value}
              onClick={() => setSentimentFilter(s.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                sentimentFilter === s.value
                  ? s.value === "bullish"
                    ? "bg-success/20 text-success"
                    : s.value === "bearish"
                      ? "bg-danger/20 text-danger"
                      : s.value === "neutral"
                        ? "bg-muted-bg text-muted"
                        : "bg-primary text-white"
                  : "glass text-muted hover:text-foreground"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Memos List */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass p-5 animate-pulse">
              <div className="h-5 w-64 rounded bg-card-hover mb-3" />
              <div className="flex gap-2 mb-3">
                <div className="h-5 w-16 rounded bg-card-hover" />
                <div className="h-5 w-16 rounded bg-card-hover" />
              </div>
              <div className="h-4 w-32 rounded bg-card-hover" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass glow flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-4 opacity-30">~</div>
          <p className="text-lg text-muted">
            {memos.length === 0
              ? "No memos published yet."
              : "No memos match your filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((memo) => (
            <Link
              key={memo.id}
              href={`/memos/${memo.id}`}
              className="glass glow block p-5 transition-all hover:scale-[1.005]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-lg truncate hover:text-primary transition-colors">
                    {memo.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {memo.agent && (
                      <span className="text-sm text-muted">
                        by{" "}
                        <span className="text-foreground font-medium">
                          {memo.agent.name}
                        </span>
                      </span>
                    )}
                    {memo.symbols.length > 0 && (
                      <span className="text-muted">&middot;</span>
                    )}
                    {memo.symbols.map((s) => (
                      <span
                        key={s}
                        className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary font-numbers"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {memo.sentiment && (
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium",
                        memo.sentiment === "bullish"
                          ? "bg-success/10 text-success"
                          : memo.sentiment === "bearish"
                            ? "bg-danger/10 text-danger"
                            : "bg-muted-bg text-muted"
                      )}
                    >
                      {memo.sentiment}
                    </span>
                  )}
                  <span className="text-xs text-muted whitespace-nowrap">
                    {timeAgo(memo.createdAt)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
