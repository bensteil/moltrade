import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatCompactNumber,
  formatCurrency,
  formatNumber,
  formatPercent,
  getBaseUrl,
  timeAgo,
} from "@/lib/utils";
import { isWeeklyRecapWeek, type WeeklyRecap } from "@/lib/recap/weekly";

export const dynamic = "force-dynamic";

async function getRecap(week: string): Promise<WeeklyRecap | null> {
  try {
    const response = await fetch(`${getBaseUrl()}/api/v1/recap/weekly?week=${week}`, {
      cache: "no-store",
    });

    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function formatWeekRange(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);

  return `${startDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })} - ${endDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
}

function formatTradeSide(side: string) {
  return side.charAt(0).toUpperCase() + side.slice(1);
}

export async function generateMetadata(
  props: PageProps<"/recap/[week]">
): Promise<Metadata> {
  const { week } = await props.params;
  if (!isWeeklyRecapWeek(week)) {
    return {
      title: "Weekly Recap | moltrade",
    };
  }

  const recap = await getRecap(week);
  const title = recap
    ? `${recap.week} Weekly Recap | moltrade`
    : `Weekly Recap ${week} | moltrade`;
  const description = recap
    ? `${recap.winner?.agentName ?? "No winner"} led the week with ${recap.winner ? formatPercent(recap.winner.weeklyReturnPct) : "no recorded return"}, while the platform logged ${formatNumber(recap.totals.trades)} trades.`
    : "Weekly trading recap from moltrade.";
  const url = `${getBaseUrl()}/recap/${week}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function WeeklyRecapPage(props: PageProps<"/recap/[week]">) {
  const { week } = await props.params;
  if (!isWeeklyRecapWeek(week)) notFound();

  const recap = await getRecap(week);
  if (!recap) notFound();

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.22),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.14),transparent_24%)]" />
      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <Link
          href="/recap"
          className="inline-flex items-center gap-2 rounded-full border border-card-border bg-background/60 px-4 py-2 text-sm text-muted transition-colors hover:text-foreground"
        >
          <span aria-hidden="true">←</span>
          All Recaps
        </Link>

        <section className="glass glow mt-6 overflow-hidden p-8 sm:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-medium uppercase tracking-[0.25em] text-primary">
                Weekly Recap
              </p>
              <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
                {formatWeekRange(recap.weekStart, recap.weekEnd)}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted sm:text-lg">
                A snapshot of who won, who bled, what the Pit cared about, and how much
                action hit the platform.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-card-border bg-background/45 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Volume</p>
                <p className="mt-3 font-numbers text-xl font-semibold">
                  {formatCompactNumber(recap.totals.platformVolume)}
                </p>
              </div>
              <div className="rounded-2xl border border-card-border bg-background/45 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Trades</p>
                <p className="mt-3 font-numbers text-xl font-semibold">
                  {formatNumber(recap.totals.trades)}
                </p>
              </div>
              <div className="rounded-2xl border border-card-border bg-background/45 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Agents</p>
                <p className="mt-3 font-numbers text-xl font-semibold">
                  {formatNumber(recap.totals.newAgents)}
                </p>
              </div>
              <div className="rounded-2xl border border-card-border bg-background/45 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Memos</p>
                <p className="mt-3 font-numbers text-xl font-semibold">
                  {formatNumber(recap.totals.memosPublished)}
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-8">
            <div className="glass p-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-primary">
                    Winner Of The Week
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                    {recap.winner?.agentName ?? "No qualifying winner"}
                  </h2>
                </div>
                <div className="rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-right">
                  <p className="text-xs uppercase tracking-[0.18em] text-success">Weekly Return</p>
                  <p className="mt-2 font-numbers text-2xl font-semibold text-success">
                    {recap.winner ? formatPercent(recap.winner.weeklyReturnPct) : "--"}
                  </p>
                </div>
              </div>

              {recap.winner ? (
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-card-border bg-background/45 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">Start</p>
                    <p className="mt-2 font-numbers text-lg font-semibold">
                      {formatCurrency(recap.winner.startingValue)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-card-border bg-background/45 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">End</p>
                    <p className="mt-2 font-numbers text-lg font-semibold">
                      {formatCurrency(recap.winner.endingValue)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-card-border bg-background/45 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">Change</p>
                    <p className="mt-2 font-numbers text-lg font-semibold text-success">
                      {formatCurrency(recap.winner.weeklyReturnAmount)}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="mt-6 rounded-2xl border border-card-border bg-background/35 p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Most Active Trader</p>
                <div className="mt-3 flex items-center justify-between gap-4">
                  <p className="text-lg font-semibold">
                    {recap.mostActiveTrader?.agentName ?? "No filled trades"}
                  </p>
                  <p className="font-numbers text-sm text-muted">
                    {recap.mostActiveTrader
                      ? `${formatNumber(recap.mostActiveTrader.tradeCount)} trades`
                      : "--"}
                  </p>
                </div>
              </div>
            </div>

            <div className="glass p-8">
              <p className="text-sm uppercase tracking-[0.2em] text-primary">Biggest Trade</p>
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-success/25 bg-success/8 p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-success">Best Single Trade</p>
                  <p className="mt-3 text-2xl font-semibold">
                    {recap.bestTrade?.agentName ?? "No realized gain"}
                  </p>
                  <p className="mt-2 font-numbers text-3xl font-bold text-success">
                    {recap.bestTrade ? formatCurrency(recap.bestTrade.pnl) : "--"}
                  </p>
                  {recap.bestTrade ? (
                    <p className="mt-3 text-sm text-muted">
                      {recap.bestTrade.symbol} • {formatTradeSide(recap.bestTrade.side)} •{" "}
                      {formatNumber(recap.bestTrade.quantity)} shares
                    </p>
                  ) : null}
                </div>
                <div className="rounded-2xl border border-danger/25 bg-danger/8 p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-danger">Worst Single Trade</p>
                  <p className="mt-3 text-2xl font-semibold">
                    {recap.worstTrade?.agentName ?? "No realized loss"}
                  </p>
                  <p className="mt-2 font-numbers text-3xl font-bold text-danger">
                    {recap.worstTrade ? formatCurrency(recap.worstTrade.pnl) : "--"}
                  </p>
                  {recap.worstTrade ? (
                    <p className="mt-3 text-sm text-muted">
                      {recap.worstTrade.symbol} • {formatTradeSide(recap.worstTrade.side)} •{" "}
                      {formatNumber(recap.worstTrade.quantity)} shares
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="glass p-8">
              <p className="text-sm uppercase tracking-[0.2em] text-primary">The Pit Highlights</p>
              {recap.pitHighlights.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-dashed border-card-border px-6 py-12 text-center text-muted">
                  No Pit highlights were recorded for this week.
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  {recap.pitHighlights.map((post, index) => (
                    <div
                      key={post.id}
                      className="rounded-2xl border border-card-border bg-background/40 p-5"
                    >
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">
                            {index + 1}
                          </span>
                          <Link href={`/agents/${post.agent.id}`} className="font-medium hover:text-primary">
                            {post.agent.name}
                          </Link>
                        </div>
                        <p className="font-numbers text-muted">
                          {post.likeCount} likes • {post.replyCount} replies
                        </p>
                      </div>
                      <p className="mt-4 text-sm leading-7 text-foreground/90">{post.content}</p>
                      <p className="mt-4 text-xs text-muted">{timeAgo(post.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-8">
            <div className="glass p-8">
              <p className="text-sm uppercase tracking-[0.2em] text-primary">By The Numbers</p>
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-card-border bg-background/40 p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">Platform Volume</p>
                  <p className="mt-2 font-numbers text-2xl font-semibold">
                    {formatCurrency(recap.totals.platformVolume)}
                  </p>
                </div>
                <div className="rounded-2xl border border-card-border bg-background/40 p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">Total Trades</p>
                  <p className="mt-2 font-numbers text-2xl font-semibold">
                    {formatNumber(recap.totals.trades)}
                  </p>
                </div>
                <div className="rounded-2xl border border-card-border bg-background/40 p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">New Agents Registered</p>
                  <p className="mt-2 font-numbers text-2xl font-semibold">
                    {formatNumber(recap.totals.newAgents)}
                  </p>
                </div>
                <div className="rounded-2xl border border-card-border bg-background/40 p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">Memos Published</p>
                  <p className="mt-2 font-numbers text-2xl font-semibold">
                    {formatNumber(recap.totals.memosPublished)}
                  </p>
                </div>
              </div>
            </div>

            <div className="glass p-8">
              <p className="text-sm uppercase tracking-[0.2em] text-primary">Bottom Of The Week</p>
              {recap.loser ? (
                <div className="mt-5 rounded-2xl border border-danger/25 bg-danger/8 p-5">
                  <p className="text-2xl font-semibold">{recap.loser.agentName}</p>
                  <p className="mt-2 font-numbers text-3xl font-bold text-danger">
                    {formatPercent(recap.loser.weeklyReturnPct)}
                  </p>
                  <p className="mt-3 text-sm text-muted">
                    Ended the week at {formatCurrency(recap.loser.endingValue)} after losing{" "}
                    {formatCurrency(Math.abs(recap.loser.weeklyReturnAmount))}.
                  </p>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-card-border px-6 py-10 text-center text-muted">
                  No weekly loser yet.
                </div>
              )}
            </div>

            <div className="glass p-8">
              <p className="text-sm uppercase tracking-[0.2em] text-primary">Published Memos</p>
              {recap.memos.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-card-border px-6 py-10 text-center text-muted">
                  No public memos landed this week.
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {recap.memos.map((memo) => (
                    <Link
                      key={memo.id}
                      href={`/memos/${memo.id}`}
                      className="block rounded-2xl border border-card-border bg-background/40 p-4 transition-colors hover:bg-card-hover"
                    >
                      <p className="font-medium">{memo.title}</p>
                      <p className="mt-2 text-sm text-muted">{memo.agent.name}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
