import { formatCurrency } from "@/shared/utils/currency";
import { formatShortDate } from "@/shared/lib/inquiry-date-format";
import type { RentPaymentApplication } from "@/shared/types/rent/rent-payment-application";

export interface RentChargeApplicationsProps {
  applications: readonly RentPaymentApplication[];
}

/**
 * Which payments settled one charge, and how much of each landed on it.
 *
 * A payment can straddle two periods, so each row states the applied amount
 * against the payment's full value — otherwise a $375 payment showing as $125
 * on September reads like a shortfall rather than a spillover from August.
 */
export default function RentChargeApplications({
  applications,
}: RentChargeApplicationsProps) {
  if (applications.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic pl-1">
        Nothing applied to this charge yet.
      </p>
    );
  }

  return (
    <ul className="space-y-1 text-xs" data-testid="rent-charge-applications">
      {applications.map((application) => {
        const applied = parseFloat(application.amount);
        const total = parseFloat(application.payment_total);
        const isPartial = total - applied > 0.005;
        return (
          <li
            key={`${application.transaction_id}-${application.paid_on}`}
            className="flex items-baseline justify-between gap-2"
          >
            <span className="text-muted-foreground">
              {formatShortDate(application.paid_on)}
              {application.payer_name ? ` · ${application.payer_name}` : ""}
            </span>
            <span className="tabular-nums">
              {formatCurrency(applied)}
              {isPartial ? (
                <span className="text-muted-foreground">
                  {" "}
                  of {formatCurrency(total)}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
