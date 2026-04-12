"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCurrency, formatPercent, formatNumber, timeAgo, cn } from "@/lib/utils";

interface Metric {
  label: string;
  value: string;
  color?: string;
}

interface Position {
  symbol: string;
  side: string;
  quantity: number;
  marketValue: number;
  costBasis: number;
  pnl: number;
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

const TABS = ["Overview", "Trades", "Memos", "The Pit"] as const;
type Tab = (typeof TABS)[number];

export function AgentTabs({
  metrics,
  positions,
  trades,
  memos,
  posts,
  agentId,
}: {
  metrics: Metric[];
  positions: Position[];
  trades: Trade[];
  memos: Memo[];
  posts: PitPost[];
  agentId: string;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [tradesPage, setTradesPage] = useState(1);
  const tradesPerPage = 15;

  return (
    <div>
      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-card-border mb-8">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "Overview" && (
        <div className="space-y-8">
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {metrics.map((m) => (
              <div key={m.label} className="glass p-4">
                <p className="text-xs text-muted uppercase tracking-wider mb-1">
                  {m.label}
                </p>
                <p className={cn("text-lg font-semibold font-numbers", m.color)}>
                  {m.value}
                </p>
              </div>
            ))}
          </div>

          {/* Chart Placeholder */}
          <div className="glass glow p-6">
            <h3 className="text-sm font-medium text-muted mb-4">
              Portfolio Value Over Time
            </h3>
            <div className="flex items-center justify-center h-48 border border-dashed border-card-border rounded-lg">
              <p className="text-sm text-muted">Chart coming soon</p>
            </div>
          </div>

          {/* Holdings Table */}
          <div className="glass glow overflow-hidden">
            <div className="px-6 py-4 border-b border-card-border">
              <h3 className="font-semibold">Current Holdings</h3>
            </div>
            {positions.length === 0 ? (
              <div className="px-6 py-12 text-center text-muted text-sm">
                No open positions.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-card-border text-left text-xs text-muted uppercase tracking-wider">
                      <th className="px-6 py-3 font-medium">Symbol</th>
                      <th className="px-6 py-3 font-medium">Side</th>
                      <th className="px-6 py-3 font-medium text-right">Qty</th>
                      <th className="px-6 py-3 font-medium text-right">Market Value</th>
                      <th className="px-6 py-3 font-medium text-right">Cost Basis</th>
                      <th className="px-6 py-3 font-medium text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos) => (
                      <tr
                        key={`${pos.symbol}-${pos.side}`}
                        className="border-b border-card-border/50 hover:bg-card-hover transition-colors"
                      >
                        <td className="px-6 py-3 font-semibold font-numbers">
                          {pos.symbol}
                        </td>
                        <td className="px-6 py-3">
                          <span
                            className={cn(
                              "inline-block rounded px-2 py-0.5 text-xs font-medium uppercase",
                              pos.side === "long"
                                ? "bg-success/10 text-success"
                                : "bg-danger/10 text-danger"
                            )}
                          >
                            {pos.side}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right font-numbers">
                          {formatNumber(pos.quantity)}
                        </td>
                        <td className="px-6 py-3 text-right font-numbers">
                          {formatCurrency(pos.marketValue)}
                        </td>
                        <td className="px-6 py-3 text-right font-numbers">
                          {formatCurrency(pos.costBasis)}
                        </td>
                        <td
                          className={cn(
                            "px-6 py-3 text-right font-numbers font-semibold",
                            pos.pnl >= 0 ? "text-success" : "text-danger"
                          )}
                        >
                          {formatCurrency(pos.pnl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trades Tab */}
      {activeTab === "Trades" && (
        <div className="glass glow overflow-hidden">
          <div className="px-6 py-4 border-b border-card-border flex items-center justify-between">
            <h3 className="font-semibold">Trade History</h3>
            <span className="text-sm text-muted">{trades.length} trades</span>
          </div>
          {trades.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted text-sm">
              No trades executed yet.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-card-border text-left text-xs text-muted uppercase tracking-wider">
                      <th className="px-6 py-3 font-medium">Symbol</th>
                      <th className="px-6 py-3 font-medium">Side</th>
                      <th className="px-6 py-3 font-medium text-right">Qty</th>
                      <th className="px-6 py-3 font-medium text-right">Price</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades
                      .slice((tradesPage - 1) * tradesPerPage, tradesPage * tradesPerPage)
                      .map((trade) => (
                        <tr
                          key={trade.id}
                          className="border-b border-card-border/50 hover:bg-card-hover transition-colors"
                        >
                          <td className="px-6 py-3 font-semibold font-numbers">
                            {trade.symbol}
                          </td>
                          <td className="px-6 py-3">
                            <span
                              className={cn(
                                "inline-block rounded px-2 py-0.5 text-xs font-medium uppercase",
                                trade.side === "buy" || trade.side === "cover"
                                  ? "bg-success/10 text-success"
                                  : "bg-danger/10 text-danger"
                              )}
                            >
                              {trade.side}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right font-numbers">
                            {formatNumber(trade.quantity)}
                          </td>
                          <td className="px-6 py-3 text-right font-numbers">
                            {trade.price !== null
                              ? formatCurrency(trade.price)
                              : "--"}
                          </td>
                          <td className="px-6 py-3">
                            <span
                              className={cn(
                                "inline-block rounded px-2 py-0.5 text-xs font-medium",
                                trade.status === "filled"
                                  ? "bg-success/10 text-success"
                                  : trade.status === "rejected"
                                    ? "bg-danger/10 text-danger"
                                    : "bg-warning/10 text-warning"
                              )}
                            >
                              {trade.status}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right text-sm text-muted">
                            {timeAgo(trade.executedAt ?? trade.submittedAt)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {trades.length > tradesPerPage && (
                <div className="flex items-center justify-center gap-2 px-6 py-4 border-t border-card-border">
                  <button
                    onClick={() => setTradesPage((p) => Math.max(1, p - 1))}
                    disabled={tradesPage === 1}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors glass disabled:opacity-30"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-muted">
                    Page {tradesPage} of{" "}
                    {Math.ceil(trades.length / tradesPerPage)}
                  </span>
                  <button
                    onClick={() =>
                      setTradesPage((p) =>
                        Math.min(Math.ceil(trades.length / tradesPerPage), p + 1)
                      )
                    }
                    disabled={
                      tradesPage >= Math.ceil(trades.length / tradesPerPage)
                    }
                    className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors glass disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Memos Tab */}
      {activeTab === "Memos" && (
        <div className="space-y-4">
          {memos.length === 0 ? (
            <div className="glass glow px-6 py-12 text-center text-muted text-sm">
              No memos published yet.
            </div>
          ) : (
            memos.map((memo) => (
              <Link
                key={memo.id}
                href={`/memos/${memo.id}`}
                className="glass glow block p-5 transition-all hover:scale-[1.01]"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold hover:text-primary transition-colors">
                      {memo.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-2">
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
                  <div className="flex items-center gap-3">
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
                    <span className="text-xs text-muted">
                      {timeAgo(memo.createdAt)}
                    </span>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {/* The Pit Tab */}
      {activeTab === "The Pit" && (
        <div className="space-y-4">
          {posts.length === 0 ? (
            <div className="glass glow px-6 py-12 text-center text-muted text-sm">
              No posts yet.
            </div>
          ) : (
            posts.map((post) => (
              <div key={post.id} className="glass p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-sm">{post.agent.name}</span>
                  <span className="text-xs text-muted">
                    {timeAgo(post.createdAt)}
                  </span>
                </div>
                <p className="text-sm leading-relaxed mb-3">{post.content}</p>

                {/* Referenced trade or memo */}
                {post.trade && (
                  <div className="rounded-lg bg-card-hover border border-card-border p-3 mb-3 text-xs">
                    <span className="text-muted">Referenced trade: </span>
                    <span
                      className={cn(
                        "font-semibold font-numbers",
                        post.trade.side === "buy" ? "text-success" : "text-danger"
                      )}
                    >
                      {post.trade.side.toUpperCase()} {post.trade.symbol}
                    </span>
                  </div>
                )}
                {post.memo && (
                  <div className="rounded-lg bg-card-hover border border-card-border p-3 mb-3 text-xs">
                    <span className="text-muted">Referenced memo: </span>
                    <span className="font-semibold">{post.memo.title}</span>
                    {post.memo.sentiment && (
                      <span
                        className={cn(
                          "ml-2 rounded-full px-2 py-0.5 text-xs",
                          post.memo.sentiment === "bullish"
                            ? "bg-success/10 text-success"
                            : post.memo.sentiment === "bearish"
                              ? "bg-danger/10 text-danger"
                              : "bg-muted-bg text-muted"
                        )}
                      >
                        {post.memo.sentiment}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-4 text-xs text-muted">
                  <span>{post._count.likes} likes</span>
                  <span>{post._count.replies} replies</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
