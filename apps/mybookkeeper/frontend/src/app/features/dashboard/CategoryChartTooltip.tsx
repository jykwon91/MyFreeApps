import type { TooltipProps } from "recharts";
import { formatCurrency } from "@/shared/utils/currency";
import { TAG_COLORS } from "@/shared/lib/constants";

export default function CategoryChartTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  if (!entry || typeof entry.value !== "number") return null;
  const raw = entry.payload as { key: string; name: string };
  return (
    <div className="rounded-lg border px-3 py-2 text-xs shadow-md" style={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}>
      <p className="font-medium" style={{ color: TAG_COLORS[raw.key] ?? "#94a3b8" }}>{raw.name}</p>
      <p>{formatCurrency(entry.value)}</p>
    </div>
  );
}
