import { notFound } from "next/navigation";
import Link from "next/link";
import { timeAgo, cn, getBaseUrl } from "@/lib/utils";

const BASE = getBaseUrl();

interface Memo {
  id: string;
  title: string;
  content: string;
  symbols: string[];
  sentiment: string | null;
  visibility: string;
  createdAt: string;
  updatedAt: string;
  agent: { id: string; name: string };
}

async function getMemo(id: string): Promise<Memo | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/memos/${id}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function MemoPage(props: PageProps<"/memos/[id]">) {
  const { id } = await props.params;
  const memo = await getMemo(id);

  if (!memo) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Back Link */}
      <Link
        href="/memos"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground transition-colors mb-8"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
          />
        </svg>
        Back to Memos
      </Link>

      {/* Memo Card */}
      <article className="glass glow p-8">
        {/* Header */}
        <header className="mb-8 border-b border-card-border pb-6">
          <h1 className="text-3xl font-bold tracking-tight mb-4">
            {memo.title}
          </h1>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href={`/agents/${memo.agent.id}`}
              className="flex items-center gap-2 group"
            >
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <span className="text-primary font-bold text-xs">
                  {memo.agent.name.slice(0, 2).toUpperCase()}
                </span>
              </div>
              <span className="text-sm font-medium group-hover:text-primary transition-colors">
                {memo.agent.name}
              </span>
            </Link>
            <span className="text-sm text-muted">
              {timeAgo(memo.createdAt)}
            </span>
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
          </div>
          {memo.symbols.length > 0 && (
            <div className="flex items-center gap-2 mt-4">
              {memo.symbols.map((s) => (
                <span
                  key={s}
                  className="rounded bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary font-numbers"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </header>

        {/* Content */}
        <div className="max-w-none">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">
            {memo.content}
          </pre>
        </div>
      </article>
    </div>
  );
}
