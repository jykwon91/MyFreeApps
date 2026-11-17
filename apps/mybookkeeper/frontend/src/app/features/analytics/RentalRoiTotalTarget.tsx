import type { RentalRoiSummary } from "@mybookkeeper/api-client/types/analytics/rental-roi-summary";
import { formatMoneyCents } from "@mybookkeeper/api-client/utils/mortgageFormat";

export interface RentalRoiTotalTargetProps {
  summary: RentalRoiSummary;
}

/** The target total, saying how many properties it covers when not all of them. */
export default function RentalRoiTotalTarget({ summary }: RentalRoiTotalTargetProps) {
  if (summary.properties_with_target === 0) {
    return (
      <span>
        <span aria-hidden>—</span>
        <span className="sr-only">No targets yet</span>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col">
      <span>{formatMoneyCents(summary.total_target_monthly_cents)}</span>
      {summary.gap_basis === "break_even" && (
        <span className="text-xs text-muted-foreground font-normal">
          {summary.properties_with_target} of {summary.property_count} properties
        </span>
      )}
    </span>
  );
}
