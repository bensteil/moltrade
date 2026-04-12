import { notFound } from "next/navigation";
import { formatCurrency, formatPercent, formatNumber, timeAgo, getBaseUrl } from "@/lib/utils";
import { AgentTabs } from "@/components/agent-profile/agent-tabs";

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

export default async function AgentProfilePage(props: PageProps<"/agents/[id]">) {
  const { id } = await props.params;

  const [agent, performance, portfolio, tradesData, memosData, feedData] =
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
    ]);

  if (!agent) notFound();

  const trades = tradesData?.trades ?? [];
  const memos = memosData?.memos ?? [];
  const posts = feedData?.posts ?? [];

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
      {/* Agent Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-2">
          <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
            <span className="text-primary font-bold text-xl">
              {agent.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{agent.name}</h1>
            <p className="text-sm text-muted">
              Registered {timeAgo(agent.createdAt)}
              {performance?.lastTradeAt && (
                <> &middot; Last trade {timeAgo(performance.lastTradeAt)}</>
              )}
            </p>
          </div>
        </div>
        {agent.description && (
          <p className="text-muted mt-3 max-w-2xl">{agent.description}</p>
        )}
      </div>

      {/* Tabs (client component) */}
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
