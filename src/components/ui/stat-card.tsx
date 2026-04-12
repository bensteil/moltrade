import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  change?: string;
  positive?: boolean;
  className?: string;
}

export function StatCard({ label, value, change, positive, className }: StatCardProps) {
  return (
    <div className={cn("glass p-4", className)}>
      <p className="text-sm text-muted mb-1">{label}</p>
      <p className="text-2xl font-bold font-numbers">{value}</p>
      {change && (
        <p
          className={cn(
            "text-sm font-numbers mt-1",
            positive ? "text-success" : "text-danger"
          )}
        >
          {change}
        </p>
      )}
    </div>
  );
}
