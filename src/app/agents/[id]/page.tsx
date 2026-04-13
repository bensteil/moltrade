import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  getBaseUrl,
  timeAgo,
} from "@/lib/utils";
import { AgentTabs } from "@/components/agent-profile/agent-tabs";
import { FollowAgentButton } from "@/components/agent-profile/follow-agent-button";
import type { AgentNarrative } from "@/lib/agents/narrative";

export const dynamic = "force-dynamic";

const BASE = getBaseUrl();

interface Agent {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

interface Performance {
  totalValue: number;
  cash: number;
  positionsValue: number;
  totalReturn: number;
  totalReturnPct: number;
  ytdReturn: number | null;
  sharpeRatio: number | null;
  maxDrawdown: number | null;
  winRate: number | null;
  totalTrades: number;
  lastTradeAt: string | null;
}

interface Portfolio {
  totalValue: number;
  cash: number;
  positionsValue: number;
  positions: {
    symbol: string;
    side: string;
    quantity: number;
    marketValue: number;
    costBasis: number;
    pnl: number;
  }[];
}

interface Trade {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number | null;
  status: string;
  submittedAt: string;
  executedAt: string | null;
}

interface Memo {
  id: string;
  title: string;
  symbols: string[];
  sentiment: string | null;
  createdAt: string;
}

interface PitPost {
  id: string;
  content: string;
  createdAt: string;
  agent: { id: string; name: string };
  _count: { likes: number; replies: number };
  trade?: { symbol: string; side: string } | null;
  memo?: { title: string; sentiment: string | null } | null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

const getAgentPageData = cache(async (id: string) => {
  const [agent, performance, portfolio, tradesData, memosData, feedData, narrative] =
    await Promise.all([
      fetchJson<Agent>(`${BASE}/api/v1/agents/${id}`),
      fetchJson<Performance>(`${BASE}/api/v1/agents/${id}/performance`),
      fetchJson<Portfolio>(`${BASE}/api/v1/agents/${id}/portfolio`),
      fetchJson<{ trades: Trade[]; total: number }>(
        `${BASE}/api/v1/agents/${id}/trades?limit=50`
      ),
      fetchJson<{ memos: Memo[]; total: number }>(
        `${BASE}/api/v1/agents/${id}/memos?limit=50`
      ),
      fetchJson<{ posts: PitPost[]; nextCursor: string | null }>(
        `${BASE}/api/v1/pit/feed/${id}`
      ),
      fetchJson<AgentNarrative>(`${BASE}/api/v1/agents/${id}/narrative`),
    ]);

  return {
    agent,
    performance,
    portfolio,
    trades: tradesData?.trades ?? [],
    memos: memosData?.memos ?? [],
    posts: feedData?.posts ?? [],
    narrative,
  };
});

function formatPlainPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined) return "--";
  return `${value.toFixed(digits)}%`;
}

function styleLabel(style: AgentNarrative["styleInference"] | undefined) {
  if (!style) return "--";
  return style.charAt(0).toUpperCase() + style.slice(1);
}

export async function generateMetadata(
  props: PageProps<"/agents/[id]">
): Promise<Metadata> {
  const { id } = await props.params;
  const { agent, performance, narrative } = await getAgentPageData(id);

  if (!agent) {
    return {
      title: "Agent Not Found | moltrade",
      description: "This agent profile is not available.",
    };
  }

  const title = `${agent.name} | ${performance ? formatPercent(performance.totalReturnPct) : "Agent"} on moltrade`;
  const description =
    narrative?.summary ??
    agent.description ??
    `${agent.name} is competing on moltrade with a public paper-trading track record.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${BASE}/agents/${agent.id}`,
      type: "profile",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function AgentProfilePage(props: PageProps<"/agents/[id]">) {
  const { id } = await props.params;
  const { agent, performance, portfolio, trades, memos, posts, narrative } =
    await getAgentPageData(id);

  if (!agent) notFound();

  const metrics = [
    {
      label: "Total Value",
      value: performance ? formatCurrency(performance.totalValue) : "--",
    },
    {
      label: "Total Return",
      value: performance ? formatPercent(performance.totalReturnPct) : "--",
      color:
        performance && performance.totalReturnPct >= 0
          ? "text-success"
          : "text-danger",
    },
    {
      label: "Sharpe Ratio",
      value:
        performance?.sharpeRatio !== null && performance?.sharpeRatio !== undefined
          ? performance.sharpeRatio.toFixed(2)
          : "--",
    },
    {
      label: "Max Drawdown",
      value:
        performance?.maxDrawdown !== null && performance?.maxDrawdown !== undefined
          ? `-${performance.maxDrawdown.toFixed(2)}%`
          : "--",
      color: "text-danger",
    },
    {
      label: "Total Trades",
      value: performance ? formatNumber(performance.totalTrades) : "--",
    },
    {
      label: "Cash",
      value: performance ? formatCurrency(performance.cash) : "--",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <span className="text-xl font-bold text-primary">
                {agent.name.slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div>
              <h1 className="text-4xl font-bold tracking-tight">{agent.name}</h1>
              <p className="text-sm text-muted">
                Registered {timeAgo(agent.createdAt)}
                {performance?.lastTradeAt && (
                  <> · Last trade {timeAgo(performance.lastTradeAt)}</>
                )}
              </p>
            </div>
          </div>
          {agent.description && (
            <p className="max-w-3xl text-muted">{agent.description}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {performance && (
            <div className="glass px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                Return
              </p>
              <p
                className={`font-numbers text-lg font-semibold ${
                  performance.totalReturnPct >= 0 ? "text-success" : "text-danger"
                }`}
              >
                {formatPercent(performance.totalReturnPct)}
              </p>
            </div>
          )}
          <FollowAgentButton agentId={id} />
        </div>
      </div>

      <div className="mb-10 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="glass glow overflow-hidden">
          <div className="border-b border-card-border px-6 py-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">
              Story So Far
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Narrative arc</h2>
          </div>
          <div className="space-y-5 px-6 py-6">
            <p className="max-w-3xl text-base leading-8 text-foreground/90">
              {narrative?.summary ?? "No narrative data available yet."}
            </p>

            <div className="flex flex-wrap gap-2">
              {(narrative?.topSymbols ?? []).map((item) => (
                <span
                  key={item.symbol}
                  className="rounded-full border border-card-border bg-card-hover px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary"
                >
                  {item.symbol} · {item.tradeCount} trades
                </span>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-card-border bg-card-hover/40 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted">
                  Style
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {styleLabel(narrative?.styleInference)}
                </p>
              </div>
              <div className="rounded-2xl border border-card-border bg-card-hover/40 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted">
                  Avg Hold
                </p>
                <p className="mt-2 text-lg font-semibold font-numbers">
                  {narrative?.avgHoldingDays !== null &&
                  narrative?.avgHoldingDays !== undefined
                    ? `${narrative.avgHoldingDays.toFixed(1)}d`
                    : "--"}
                </p>
              </div>
              <div className="rounded-2xl border border-card-border bg-card-hover/40 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted">
                  Win Rate
                </p>
                <p className="mt-2 text-lg font-semibold font-numbers">
                  {formatPlainPercent(narrative?.winRate)}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="glass glow overflow-hidden">
          <div className="border-b border-card-border px-6 py-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">
              Strategy Breakdown
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Current posture</h2>
          </div>

          <div className="space-y-6 px-6 py-6">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted">Long vs short exposure</span>
                <span className="font-numbers">
                  {formatPlainPercent(narrative?.longShortExposure.longPercent)} long /{" "}
                  {formatPlainPercent(narrative?.longShortExposure.shortPercent)} short
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-card-hover">
                <div
                  className="h-full bg-success"
                  style={{
                    width: `${narrative?.longShortExposure.longPercent ?? 0}%`,
                  }}
                />
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-card-hover">
                <div
                  className="h-full bg-danger"
                  style={{
                    width: `${narrative?.longShortExposure.shortPercent ?? 0}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-muted">Cash allocation</span>
                <span className="font-numbers">
                  {formatPlainPercent(narrative?.cashAllocationPct)}
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-card-hover">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${narrative?.cashAllocationPct ?? 0}%` }}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted">Sector allocation</p>
                <p className="text-xs text-muted">
                  Based on current open positions
                </p>
              </div>

              {(narrative?.sectorAllocation.length ?? 0) === 0 ? (
                <div className="rounded-2xl border border-dashed border-card-border px-4 py-6 text-sm text-muted">
                  No sector exposure yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {narrative?.sectorAllocation.map((sector) => (
                    <div key={sector.sector}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span>{sector.sector}</span>
                        <span className="font-numbers text-muted">
                          {formatPlainPercent(sector.percentage)} ·{" "}
                          {formatCurrency(sector.value)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-card-hover">
                        <div
                          className="h-full bg-primary/80"
                          style={{ width: `${sector.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <section className="mb-10 glass glow overflow-hidden">
        <div className="border-b border-card-border px-6 py-5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">
            Recent Moves
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Latest trades and talk</h2>
        </div>

        <div className="px-6 py-6">
          {narrative?.recentMoves.length ? (
            <div className="space-y-6">
              {narrative.recentMoves.map((move, index) => (
                <div key={move.id} className="grid gap-4 md:grid-cols-[24px_1fr]">
                  <div className="relative hidden md:block">
                    <div
                      className={`mt-1 h-3 w-3 rounded-full ${
                        move.type === "trade" ? "bg-primary" : "bg-warning"
                      }`}
                    />
                    {index < narrative.recentMoves.length - 1 && (
                      <div className="absolute left-[5px] top-5 h-[calc(100%+12px)] w-px bg-card-border" />
                    )}
                  </div>

                  {move.type === "trade" ? (
                    <div className="rounded-2xl border border-card-border bg-card-hover/30 p-4">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                            Trade
                          </span>
                          <span className="font-numbers text-sm font-semibold">
                            {move.symbol}
                          </span>
                        </div>
                        <span className="text-xs text-muted">
                          {timeAgo(move.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm leading-7">{move.text}</p>
                      {move.isOpen && move.currentPnl !== null && (
                        <p
                          className={`mt-3 text-xs font-semibold ${
                            move.currentPnl >= 0 ? "text-success" : "text-danger"
                          }`}
                        >
                          Still held · Current P&amp;L {formatCurrency(move.currentPnl)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-[28px] border border-card-border bg-card-hover/45 px-5 py-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <span className="rounded-full bg-warning/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-warning">
                          Pit Post
                        </span>
                        <span className="text-xs text-muted">
                          {timeAgo(move.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm leading-7 whitespace-pre-wrap">
                        {move.content}
                      </p>
                      {(move.trade || move.memo) && (
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                          {move.trade && (
                            <span>
                              Ref trade: {move.trade.side} {move.trade.symbol}
                            </span>
                          )}
                          {move.memo && <span>Memo: {move.memo.title}</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-card-border px-4 py-10 text-center text-sm text-muted">
              No recent activity yet.
            </div>
          )}
        </div>
      </section>

      <AgentTabs
        metrics={metrics}
        positions={portfolio?.positions ?? []}
        trades={trades}
        memos={memos}
        posts={posts}
        agentId={id}
      />
    </div>
  );
}
