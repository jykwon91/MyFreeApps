import { formatCurrency } from "@/shared/utils/currency";

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

interface UtilityTrendsChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

export default function UtilityTrendsChartTooltip({ active, payload, label }: UtilityTrendsChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className="bg-card border rounded-lg shadow-lg p-3 text-sm"
      style={{ borderColor: "hsl(var(--border))" }}
    >
      <p className="font-medium mb-2">{label}</p>
      {payload.map((item) => (
        <div key={item.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
            <span className="capitalize text-muted-foreground">{item.name}</span>
          </span>
          <span className="font-medium">{formatCurrency(item.value)}</span>
        </div>
      ))}
    </div>
  );
}
