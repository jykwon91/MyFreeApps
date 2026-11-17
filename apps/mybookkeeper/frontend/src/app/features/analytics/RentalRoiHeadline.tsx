import type { RentalRoiSummary } from "@mybookkeeper/api-client/types/analytics/rental-roi-summary";
import { formatMoneyCents } from "@mybookkeeper/api-client/utils/mortgageFormat";
import { rentalRoiHeadline } from "@mybookkeeper/api-client/utils/rentalRoi";
import RentalRoiGap from "./RentalRoiGap";

export interface RentalRoiHeadlineProps {
  summary: RentalRoiSummary;
}

export default function RentalRoiHeadline({ summary }: RentalRoiHeadlineProps) {
  const { title, coverage } = rentalRoiHeadline(summary);
  return (
    <section
      aria-live="polite"
      aria-label="Monthly revenue target"
      data-testid="rental-roi-headline"
      className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div>
        <h2 className="text-2xl font-semibold" data-testid="rental-roi-headline-title">{title}</h2>
        {coverage && <p className="text-sm text-muted-foreground">{coverage}</p>}
      </div>
      <dl className="flex gap-6 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Actual avg</dt>
          <dd className="font-medium tabular-nums" data-testid="rental-roi-headline-actual">
            {formatMoneyCents(summary.total_actual_revenue_monthly_cents)}/mo
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Gap</dt>
          <dd data-testid="rental-roi-headline-gap">
            <RentalRoiGap cents={summary.total_gap_monthly_cents} basis={summary.gap_basis} />
          </dd>
        </div>
      </dl>
    </section>
  );
}
