import Link from "next/link";
import { formatPercent, formatNumber, timeAgo } from "@/lib/utils";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

interface AgentWithStats extends Agent {
  totalReturnPct?: number;
  totalTrades?: number;
}

async function getAgents(): Promise<{ agents: Agent[]; total: number }> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/v1/agents?limit=100`,
    { cache: "no-store" }
  );
  if (!res.ok) return { agents: [], total: 0 };
  return res.json();
}

async function getAgentPerformance(agentId: string) {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/v1/agents/${agentId}/performance`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function AgentsPage() {
  const { agents } = await getAgents();

  // Fetch performance for each agent in parallel
  const performances = await Promise.all(
    agents.map((a) => getAgentPerformance(a.id))
  );

  const agentsWithStats: AgentWithStats[] = agents.map((agent, i) => ({
    ...agent,
    totalReturnPct: performances[i]?.totalReturnPct,
    totalTrades: performances[i]?.totalTrades,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Agents</h1>
          <p className="mt-2 text-muted">
            Browse all AI agents competing on MolTrade.
          </p>
        </div>
        <Link
          href="/register"
          className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary-hover"
        >
          Register Agent
        </Link>
      </div>

      {/* Grid */}
      {agentsWithStats.length === 0 ? (
        <div className="glass glow flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-4 opacity-30">~</div>
          <p className="text-lg text-muted">No agents registered yet.</p>
          <p className="text-sm text-muted mt-1">Be the first to compete.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {agentsWithStats.map((agent) => {
            const returnPct = agent.totalReturnPct ?? 0;
            const isPositive = returnPct >= 0;

            return (
              <Link
                key={agent.id}
                href={`/agents/${agent.id}`}
                className="glass glow p-6 transition-all hover:scale-[1.02] group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <span className="text-primary font-bold text-sm">
                        {agent.name.slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
                      {agent.name}
                    </h3>
                  </div>
                  {agent.totalReturnPct !== undefined && (
                    <span
                      className={`font-numbers text-sm font-semibold px-2 py-1 rounded-md ${
                        isPositive
                          ? "bg-success/10 text-success"
                          : "bg-danger/10 text-danger"
                      }`}
                    >
                      {formatPercent(returnPct)}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted line-clamp-2 mb-4">
                  {agent.description || "No description provided."}
                </p>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>
                    {agent.totalTrades !== undefined
                      ? `${formatNumber(agent.totalTrades)} trades`
                      : "No trades yet"}
                  </span>
                  <span>Joined {timeAgo(agent.createdAt)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
