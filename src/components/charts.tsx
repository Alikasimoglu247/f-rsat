"use client";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import { money, categoryLabels } from "@/lib/constants";
import type { Category } from "@/lib/constants";
import type { ListingView } from "@/lib/listings";
export function PriceChart({
  prices,
}: {
  prices: NonNullable<ListingView["prices"]>;
}) {
  const data = prices.map((item) => ({
    date: new Intl.DateTimeFormat("tr-TR", {
      day: "numeric",
      month: "short",
      timeZone: "Europe/Istanbul",
    }).format(new Date(item.observedAt)),
    price: Number(item.price),
  }));
  return (
    <div
      className="chart"
      role="img"
      aria-label={`${data.length} saklanmış fiyat gözleminin grafiği`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="price-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ed6e42" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#ed6e42" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="4 4"
            vertical={false}
            stroke="var(--border)"
          />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            width={70}
            tickFormatter={(value) =>
              `${(Number(value) / 1000000).toFixed(1)}M`
            }
            tickLine={false}
            axisLine={false}
            domain={["auto", "auto"]}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              color: "var(--foreground)",
            }}
            formatter={(value) => [money(Number(value)), "İstenen fiyat"]}
          />
          <Area
            isAnimationActive={false}
            type="linear"
            dataKey="price"
            stroke="#ed6e42"
            strokeWidth={2.5}
            fill="url(#price-fill)"
            dot={{ r: 4, fill: "#ed6e42" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function CoverageChart({
  counts,
}: {
  counts: { category: Category; count: number }[];
}) {
  const data = Object.entries(categoryLabels).map(([key, label]) => ({
    label,
    count: counts.find((item) => item.category === key)?.count ?? 0,
  }));
  return (
    <div
      className="chart coverage"
      role="img"
      aria-label="Kategorilere göre kayıtlı ilan sayıları"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ left: -20, right: 10, top: 10, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="4 4"
            vertical={false}
            stroke="var(--border)"
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              color: "var(--foreground)",
            }}
            formatter={(value) => [String(value), "İlan"]}
          />
          <Bar
            isAnimationActive={false}
            dataKey="count"
            fill="#ed6e42"
            radius={[7, 7, 0, 0]}
            maxBarSize={34}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
