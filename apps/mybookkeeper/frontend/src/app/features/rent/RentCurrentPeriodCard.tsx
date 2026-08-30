import { ProgressBar } from "@platform/ui";
import { formatCurrency } from "@/shared/utils/currency";
import { formatShortDate } from "@/shared/lib/inquiry-date-format";
import RentChargeStatusBadge from "./RentChargeStatusBadge";
import type { RentPeriodSummary } from "@/shared/types/rent/rent-period-summary";
import type { ProgressTone } from "@platform/ui";

export interface RentCurrentPeriodCardProps {
  period: RentPeriodSummary;
}

function toneFor(status: RentPeriodSummary["status"]): ProgressTone {
  if (status === "paid") return "success";
  if (status === "overdue") return "warning";
  return "primary";
}

/**
 * The headline: how much of this period's rent has landed.
 *
 * This card exists because it is the one question a host actually asks about a
 * tenant who pays on a different rhythm than they are billed on. Everything
 * below it in the panel is the evidence; this is the answer, stated as a
 * fraction rather than a running total so "$1,125" is never mistaken for
 * "paid up".
 */
export default function RentCurrentPeriodCard({
  period,
}: RentCurrentPeriodCardProps) {
  const amount = parseFloat(period.amount);
  const allocated = parseFloat(period.allocated);
  const remaining = parseFloat(period.remaining);
  const percent = amount > 0 ? (allocated / amount) * 100 : 100;

  return (
    <div
      className="rounded-lg border bg-card text-card-foreground p-4 space-y-3"
      data-testid="rent-current-period"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground">
            {period.label} · {formatShortDate(period.period_start)} –{" "}
            {formatShortDate(period.period_end)}
          </p>
          <p className="text-xl font-semibold tabular-nums mt-0.5">
            <span data-testid="rent-current-allocated">
              {formatCurrency(allocated)}
            </span>
            <span className="text-muted-foreground font-normal text-base">
              {" "}
              of {formatCurrency(amount)}
            </span>
          </p>
        </div>
        <RentChargeStatusBadge
          status={period.status}
          data-testid="rent-current-status"
        />
      </div>

      <ProgressBar
        value={percent}
        tone={toneFor(period.status)}
        label={`${formatCurrency(allocated)} of ${formatCurrency(amount)} paid for ${period.label}`}
      />

      <p className="text-xs text-muted-foreground" data-testid="rent-current-remaining">
        {remaining > 0
          ? `${formatCurrency(remaining)} still to come this period.`
          : "This period is fully covered."}
      </p>
    </div>
  );
}
