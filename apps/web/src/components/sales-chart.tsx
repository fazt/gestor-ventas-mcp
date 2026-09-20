"use client";

import { format } from "date-fns";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, parseMoney } from "@/lib/money";
import type { SalesChartPoint } from "@/lib/types";

export function SalesChart({ data }: { data: SalesChartPoint[] }) {
  const chartData = data.map((point) => ({
    date: format(new Date(point.date), "dd/MM"),
    total: parseMoney(point.total),
    count: point.count,
  }));

  if (chartData.length === 0) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Sin datos en el período.</p>;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => `${v}`} />
          <Tooltip
            formatter={(value) => formatMoney(Number(value ?? 0))}
            labelClassName="text-foreground"
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke="var(--color-primary)"
            fill="url(#salesFill)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
