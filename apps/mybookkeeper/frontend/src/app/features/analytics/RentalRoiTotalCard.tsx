import type { RentalRoiSummary } from "@mybookkeeper/api-client/types/analytics/rental-roi-summary";
import { formatMoneyCents } from "@mybookkeeper/api-client/utils/mortgageFormat";
import Card from "@/shared/components/ui/Card";
import RentalRoiGap from "./RentalRoiGap";
import RentalRoiTotalTarget from "./RentalRoiTotalTarget";

export interface RentalRoiTotalCardProps {
  summary: RentalRoiSummary;
}

export default function RentalRoiTotalCard({ summary }: RentalRoiTotalCardProps) {
  return (
    <Card className="p-4 bg-muted/40">
      <article aria-label="All properties" data-testid="rental-roi-total-card" className="space-y-3">
        <h3 className="font-semibold">All properties</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Break-even</dt>
            <dd className="font-medium tabular-nums">{formatMoneyCents(summary.total_break_even_monthly_cents)}/mo</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Target</dt>
            <dd className="font-medium tabular-nums">
              <RentalRoiTotalTarget summary={summary} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Actual</dt>
            <dd className="font-medium tabular-nums">{formatMoneyCents(summary.total_actual_revenue_monthly_cents)}/mo</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Gap</dt>
            <dd>
              <RentalRoiGap cents={summary.total_gap_monthly_cents} basis={summary.gap_basis} />
            </dd>
          </div>
        </dl>
      </article>
    </Card>
  );
}
