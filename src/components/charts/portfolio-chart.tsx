"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

interface DataPoint {
  date: string;
  value: number;
}

interface PortfolioChartProps {
  data: DataPoint[];
  height?: number;
}

export function PortfolioChart({ data, height = 300 }: PortfolioChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted glass"
        style={{ height }}
      >
        No data yet — start trading to see your portfolio chart.
      </div>
    );
  }

  const startValue = data[0]?.value ?? 100000;
  const endValue = data[data.length - 1]?.value ?? 100000;
  const isPositive = endValue >= startValue;
  const color = isPositive ? "#22c55e" : "#ef4444";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <defs>
          <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(255,255,255,0.05)"
        />
        <XAxis
          dataKey="date"
          tick={{ fill: "#94a3b8", fontSize: 12 }}
          axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#94a3b8", fontSize: 12 }}
          axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
          tickLine={false}
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{
            background: "rgba(10, 10, 15, 0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "8px",
            color: "#f1f5f9",
          }}
          formatter={(value) => [formatCurrency(Number(value)), "Portfolio"]}
          labelStyle={{ color: "#94a3b8" }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill="url(#portfolioGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
