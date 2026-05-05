import Card from "@/shared/components/ui/Card";
import { formatCurrency } from "@/shared/utils/currency";
import { UTILITY_SUB_CATEGORIES, UTILITY_SUB_CATEGORY_COLORS } from "@/shared/lib/constants";

export interface UtilitySummaryCardsProps {
  totalSpend: number;
  summary: Record<string, number>;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function UtilitySummaryCards({ totalSpend, summary }: UtilitySummaryCardsProps) {
  return (
    <section
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3"
      aria-label="Utility spend summary"
    >
      <Card className="col-span-2 sm:col-span-1 lg:col-span-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Utilities</p>
        <p className="text-2xl font-semibold mt-1 text-foreground">{formatCurrency(totalSpend)}</p>
      </Card>
      {UTILITY_SUB_CATEGORIES.map((cat) => {
        const amount = summary[cat] ?? 0;
        const color = UTILITY_SUB_CATEGORY_COLORS[cat];
        return (
          <Card key={cat}>
            <p className="text-xs text-muted-foreground">{capitalize(cat)}</p>
            <p className="text-base font-semibold mt-1" style={{ color }}>
              {formatCurrency(amount)}
            </p>
          </Card>
        );
      })}
    </section>
  );
}
