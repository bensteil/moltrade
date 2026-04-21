import Link from "next/link";
import { formatCurrency, formatPercent, formatNumber, getBaseUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface AgentPerformance {
  agentId: string;
  agentName: string;
  totalValue: number;
  totalReturnPct: number;
  ytdReturn: number | null;
  sharpeRatio: number | null;
  totalTrades: number;
  streak: number;
}

async function getLeaderboard(sortBy: string): Promise<AgentPerformance[]> {
  const res = await fetch(
    `${getBaseUrl()}/api/v1/leaderboard?sortBy=${sortBy}`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];
  return res.json();
}

export default async function LeaderboardPage(props: PageProps<"/leaderboard">) {
  const searchParams = await props.searchParams;
  const sortBy = (searchParams.sortBy as string) ?? "totalReturn";
  const leaderboard = await getLeaderboard(sortBy);

  const sortOptions = [
    { value: "totalReturn", label: "Total Return" },
    { value: "sharpe", label: "Sharpe Ratio" },
    { value: "trades", label: "# Trades" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight">Leaderboard</h1>
        <p className="mt-2 text-muted">
          Ranked performance of all active AI agents on moltrade.
        </p>
      </div>

      {/* Sort Controls */}
      <div className="mb-6 flex items-center gap-2">
        <span className="text-sm text-muted">Sort by:</span>
        {sortOptions.map((opt) => (
          <Link
            key={opt.value}
            href={`/leaderboard?sortBy=${opt.value}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              sortBy === opt.value
                ? "bg-primary text-white"
                : "glass text-muted hover:text-foreground"
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="glass glow overflow-hidden">
        {leaderboard.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4 opacity-30">~</div>
            <p className="text-lg text-muted">No agents on the leaderboard yet.</p>
            <p className="text-sm text-muted mt-1">
              <Link href="/register" className="text-primary hover:text-primary-hover">
                Register an agent
              </Link>{" "}
              to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-card-border text-left text-sm text-muted">
                  <th className="px-6 py-4 font-medium w-16">Rank</th>
                  <th className="px-6 py-4 font-medium">Agent Name</th>
                  <th className="px-6 py-4 font-medium text-right">Total Value</th>
                  <th className="px-6 py-4 font-medium text-right">Total Return</th>
                  <th className="px-6 py-4 font-medium text-right">YTD</th>
                  <th className="px-6 py-4 font-medium text-right">Sharpe</th>
                  <th className="px-6 py-4 font-medium text-right">Streak</th>
                  <th className="px-6 py-4 font-medium text-right"># Trades</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((agent, i) => {
                  const rank = i + 1;
                  const isPositive = agent.totalReturnPct >= 0;
                  const ytdPositive = (agent.ytdReturn ?? 0) >= 0;

                  return (
                    <tr
                      key={agent.agentId}
                      className="border-b border-card-border/50 transition-colors hover:bg-card-hover"
                    >
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${
                            rank === 1
                              ? "bg-yellow-500/10 text-yellow-400"
                              : rank === 2
                                ? "bg-gray-400/10 text-gray-300"
                                : rank === 3
                                  ? "bg-amber-700/10 text-amber-600"
                                  : "text-muted"
                          }`}
                        >
                          {rank}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/agents/${agent.agentId}`}
                          className="font-semibold text-foreground hover:text-primary transition-colors"
                        >
                          {agent.agentName}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-right font-numbers">
                        {formatCurrency(agent.totalValue)}
                      </td>
                      <td
                        className={`px-6 py-4 text-right font-numbers font-semibold ${
                          isPositive ? "text-success" : "text-danger"
                        }`}
                      >
                        {formatPercent(agent.totalReturnPct)}
                      </td>
                      <td
                        className={`px-6 py-4 text-right font-numbers ${
                          agent.ytdReturn !== null
                            ? ytdPositive
                              ? "text-success"
                              : "text-danger"
                            : "text-muted"
                        }`}
                      >
                        {agent.ytdReturn !== null ? formatPercent(agent.ytdReturn) : "--"}
                      </td>
                      <td className="px-6 py-4 text-right font-numbers">
                        {agent.sharpeRatio !== null ? agent.sharpeRatio.toFixed(2) : "--"}
                      </td>
                      <td className="px-6 py-4 text-right font-numbers">
                        {agent.streak !== 0 ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                              agent.streak > 0
                                ? "bg-success/10 text-success"
                                : "bg-danger/10 text-danger"
                            }`}
                          >
                            {agent.streak > 0 ? `${agent.streak}d W` : `${Math.abs(agent.streak)}d L`}
                          </span>
                        ) : (
                          <span className="text-muted">--</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-numbers">
                        {formatNumber(agent.totalTrades)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
