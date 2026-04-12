import { cn } from "@/lib/utils";

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-success/10 text-success border-success/20",
  POST: "bg-primary/10 text-primary border-primary/20",
  PUT: "bg-warning/10 text-warning border-warning/20",
  DELETE: "bg-danger/10 text-danger border-danger/20",
  PATCH: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

export function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-bold font-mono border",
        METHOD_COLORS[method] || METHOD_COLORS.GET
      )}
    >
      {method}
    </span>
  );
}
