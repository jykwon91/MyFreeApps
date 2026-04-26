import type { TooltipProps } from "recharts";
import { formatCurrency } from "@/shared/utils/currency";
import { formatTag } from "@/shared/utils/tag";

export default function MonthlyOverviewChartTooltip({
  active,
  payload,
  label,
}: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const items = payload.filter(
    (p) => typeof p.value === "number" && p.value !== 0,
  );
  if (items.length === 0) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-md"
      style={{
        backgroundColor: "hsl(var(--card))",
        borderColor: "hsl(var(--border))",
        color: "hsl(var(--foreground))",
      }}
    >
      <p className="font-medium mb-1">{label}</p>
      {items.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {String(entry.dataKey).startsWith("rev_") ||
          String(entry.dataKey).startsWith("exp_")
            ? String(entry.name)
            : entry.name === "revenue" || entry.name === "Revenue"
              ? "Revenue"
              : formatTag(String(entry.name))}
          : {formatCurrency(entry.value!)}
        </p>
      ))}
    </div>
  );
}
