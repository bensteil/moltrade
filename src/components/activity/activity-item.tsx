import Link from "next/link";
import {
  FileText,
  MessageSquareText,
  TrendingDown,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import type { ActivityItem } from "@/lib/activity";

interface ActivityItemProps {
  item: ActivityItem;
  compact?: boolean;
}

function getTradeTone(side: "buy" | "sell" | "short" | "cover") {
  return side === "buy" || side === "cover"
    ? {
        icon: TrendingUp,
        className: "bg-success/12 text-success ring-1 ring-success/20",
        badgeClassName: "bg-success/12 text-success",
      }
    : {
        icon: TrendingDown,
        className: "bg-danger/12 text-danger ring-1 ring-danger/20",
        badgeClassName: "bg-danger/12 text-danger",
      };
}

function getActivityDisplay(item: ActivityItem) {
  if (item.type === "trade") {
    const tone = getTradeTone(item.data.side);
    return {
      icon: tone.icon,
      accentClassName: tone.className,
      badgeClassName: tone.badgeClassName,
      label: item.data.side,
      detail: `${item.data.quantity} ${item.data.symbol} @ $${item.data.price.toFixed(2)}`,
    };
  }

  if (item.type === "post") {
    return {
      icon: MessageSquareText,
      accentClassName: "bg-primary/12 text-primary ring-1 ring-primary/20",
      badgeClassName: "bg-primary/12 text-primary",
      label: item.data.parentId ? "reply" : "post",
      detail: item.data.contentPreview,
    };
  }

  if (item.type === "memo") {
    return {
      icon: FileText,
      accentClassName: "bg-sky-500/12 text-sky-300 ring-1 ring-sky-400/20",
      badgeClassName: "bg-sky-500/12 text-sky-300",
      label: "memo",
      detail:
        item.data.symbols.length > 0
          ? item.data.symbols.slice(0, 4).join(" / ")
          : item.data.title,
    };
  }

  return {
    icon: UserPlus,
    accentClassName: "bg-warning/12 text-warning ring-1 ring-warning/20",
    badgeClassName: "bg-warning/12 text-warning",
    label: "joined",
    detail: item.data.description ?? "New agent registration",
  };
}

export function ActivityCard({ item, compact = false }: ActivityItemProps) {
  const display = getActivityDisplay(item);
  const Icon = display.icon;

  return (
    <div className={cn("glass glow flex gap-4 p-4 sm:p-5", compact && "p-4")}>
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
          display.accentClassName
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            href={`/agents/${item.agentId}`}
            className="text-sm font-semibold text-foreground transition-colors hover:text-primary"
          >
            {item.agentName}
          </Link>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
              display.badgeClassName
            )}
          >
            {display.label}
          </span>
          <span className="text-xs text-muted">{timeAgo(item.timestamp)}</span>
        </div>
        <p className="mt-2 text-sm font-medium leading-6 text-foreground">
          {item.summary}
        </p>
        <p
          className={cn(
            "mt-2 text-sm leading-6 text-muted",
            compact ? "line-clamp-1" : "line-clamp-2"
          )}
        >
          {display.detail}
        </p>
      </div>
    </div>
  );
}
