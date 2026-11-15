import { EXPIRES_SOON_DAYS, EXPIRING_SOON_DAYS } from "@mybookkeeper/api-client/constants/insuranceExpiry";
import { daysUntilExpiry, expiryLabel } from "@mybookkeeper/api-client/utils/insuranceExpiry";
import { localToday } from "@platform/core/utils/localToday";

export interface InsuranceExpirationBadgeProps {
  expirationDate: string | null;
}

/**
 * Badge that surfaces upcoming and past insurance policy expirations.
 *
 * - Past due → red "Expired"
 * - Within 30 days → amber "Expires in N days" ("today" / "tomorrow" on the last two)
 * - Within 90 days → yellow "Expires in N days"
 *
 * Days are counted on the calendar from the local today, as the phone does.
 * - Beyond → nothing rendered
 */
export default function InsuranceExpirationBadge({ expirationDate }: InsuranceExpirationBadgeProps) {
  if (!expirationDate) return null;

  const todayIso = localToday();
  const daysUntil = daysUntilExpiry(expirationDate, todayIso);
  const label = expiryLabel(expirationDate, todayIso);

  if (daysUntil < 0) {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-destructive/10 text-destructive"
        data-testid="expiration-badge-expired"
      >
        Expired
      </span>
    );
  }

  if (daysUntil <= EXPIRING_SOON_DAYS) {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700"
        data-testid="expiration-badge-soon"
      >
        {label}
      </span>
    );
  }

  if (daysUntil <= EXPIRES_SOON_DAYS) {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700"
        data-testid="expiration-badge-upcoming"
      >
        {label}
      </span>
    );
  }

  return null;
}
