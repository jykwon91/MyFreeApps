import { formatCurrency } from "@/shared/utils/currency";
import { formatLongDate } from "@/shared/lib/inquiry-date-format";
import { RENT_CADENCE_LABEL } from "./rent-labels";
import type { RentSchedule } from "@/shared/types/rent/rent-schedule";

export interface RentScheduleFixedTermsProps {
  schedule: RentSchedule;
}

/**
 * The parts of a schedule that cannot be edited, and why.
 *
 * Shown in place of the amount/cadence inputs when amending an existing
 * schedule. Stating the reason inline is the difference between a host
 * thinking the form is broken and understanding that a rent increase is a new
 * schedule.
 */
export default function RentScheduleFixedTerms({
  schedule,
}: RentScheduleFixedTermsProps) {
  return (
    <p className="text-sm" data-testid="rent-schedule-fixed-terms">
      <span className="font-medium tabular-nums">
        {formatCurrency(schedule.amount)}
      </span>{" "}
      <span className="text-muted-foreground">
        {RENT_CADENCE_LABEL[schedule.cadence]}, starting{" "}
        {formatLongDate(schedule.start_date)}. To change the rent, end this
        schedule and add a new one from the day the new rate applies — that
        keeps past periods at the rate they were charged.
      </span>
    </p>
  );
}
