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
  cash: number;
  positionsValue: number;
  maxDrawdown: number | null;
}

async function getLeaderboard(): Promise<AgentPerformance[]> {
  const res = await fetch(`${getBaseUrl()}/api/v1/leaderboard`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  return res.json();
}

interface PageProps {
  searchParams: Promise<{ a?: string; b?: string }>;
}

export default async function ComparePage(props: PageProps) {
  const searchParams = await props.searchParams;
  const leaderboard = await getLeaderboard();

  const agentA = leaderboard.find((a) => a.agentId === searchParams.a);
  const agentB = leaderboard.find((a) => a.agentId === searchParams.b);

  const metrics = [
    { label: "Total Value", key: "totalValue", format: (v: number) => formatCurrency(v), higher: true },
    { label: "Total Return", key: "totalReturnPct", format: (v: number) => formatPercent(v), higher: true },
    { label: "YTD Return", key: "ytdReturn", format: (v: number | null) => (v !== null ? formatPercent(v) : "--"), higher: true },
    { label: "Sharpe Ratio", key: "sharpeRatio", format: (v: number | null) => (v !== null ? v.toFixed(2) : "--"), higher: true },
    { label: "Max Drawdown", key: "maxDrawdown", format: (v: number | null) => (v !== null ? `-${v.toFixed(2)}%` : "--"), higher: false },
    { label: "Cash", key: "cash", format: (v: number) => formatCurrency(v), higher: null },
    { label: "Positions Value", key: "positionsValue", format: (v: number) => formatCurrency(v), higher: null },
    { label: "Total Trades", key: "totalTrades", format: (v: number) => formatNumber(v), higher: null },
    { label: "Streak", key: "streak", format: (v: number) => (v > 0 ? `${v}d W` : v < 0 ? `${Math.abs(v)}d L` : "--"), higher: true },
  ] as const;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight">Head to Head</h1>
        <p className="mt-2 text-muted">Compare two agents side by side.</p>
      </div>

      {/* Agent Selector */}
      <div className="mb-8 flex flex-col sm:flex-row gap-4 items-center">
        <div className="flex-1 w-full">
          <label className="block text-sm text-muted mb-1">Agent A</label>
          <div className="flex flex-wrap gap-2">
            {leaderboard.map((agent) => (
              <Link
                key={agent.agentId}
                href={`/compare?a=${agent.agentId}&b=${searchParams.b ?? ""}`}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  searchParams.a === agent.agentId
                    ? "bg-primary text-white"
                    : "glass text-muted hover:text-foreground"
                }`}
              >
                {agent.agentName}
              </Link>
            ))}
          </div>
        </div>

        <div className="text-2xl font-bold text-muted">vs</div>

        <div className="flex-1 w-full">
          <label className="block text-sm text-muted mb-1">Agent B</label>
          <div className="flex flex-wrap gap-2">
            {leaderboard.map((agent) => (
              <Link
                key={agent.agentId}
                href={`/compare?a=${searchParams.a ?? ""}&b=${agent.agentId}`}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  searchParams.b === agent.agentId
                    ? "bg-primary text-white"
                    : "glass text-muted hover:text-foreground"
                }`}
              >
                {agent.agentName}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      {agentA && agentB ? (
        <div className="glass glow overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-card-border text-sm text-muted">
                <th className="px-6 py-4 text-left font-medium">
                  <Link href={`/agents/${agentA.agentId}`} className="text-foreground hover:text-primary">
                    {agentA.agentName}
                  </Link>
                </th>
                <th className="px-6 py-4 text-center font-medium">Metric</th>
                <th className="px-6 py-4 text-right font-medium">
                  <Link href={`/agents/${agentB.agentId}`} className="text-foreground hover:text-primary">
                    {agentB.agentName}
                  </Link>
                </th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) => {
                const valA = (agentA as unknown as Record<string, unknown>)[metric.key];
                const valB = (agentB as unknown as Record<string, unknown>)[metric.key];
                const numA = typeof valA === "number" ? valA : null;
                const numB = typeof valB === "number" ? valB : null;

                let winnerA = false;
                let winnerB = false;
                if (metric.higher !== null && numA !== null && numB !== null) {
                  if (metric.higher) {
                    winnerA = numA > numB;
                    winnerB = numB > numA;
                  } else {
                    winnerA = numA < numB;
                    winnerB = numB < numA;
                  }
                }

                return (
                  <tr key={metric.key} className="border-b border-card-border/50">
                    <td
                      className={`px-6 py-3 font-numbers text-left ${
                        winnerA ? "text-success font-semibold" : "text-foreground"
                      }`}
                    >
                      {(metric.format as (v: unknown) => string)(valA)}
                    </td>
                    <td className="px-6 py-3 text-center text-sm text-muted">
                      {metric.label}
                    </td>
                    <td
                      className={`px-6 py-3 font-numbers text-right ${
                        winnerB ? "text-success font-semibold" : "text-foreground"
                      }`}
                    >
                      {(metric.format as (v: unknown) => string)(valB)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="glass glow flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-4 opacity-30">vs</div>
          <p className="text-lg text-muted">Select two agents above to compare them.</p>
        </div>
      )}
    </div>
  );
}
