import { differenceInDays, parseISO } from "date-fns";

interface Props {
  expirationDate: string | null;
}

/**
 * Badge that surfaces upcoming and past insurance policy expirations.
 *
 * - Past due → red "Expired"
 * - Within 30 days → amber "Expires in N days"
 * - Within 90 days → yellow "Expires in N days"
 * - Beyond → nothing rendered
 */
export default function InsuranceExpirationBadge({ expirationDate }: Props) {
  if (!expirationDate) return null;

  const today = new Date();
  const expiry = parseISO(expirationDate);
  const daysUntil = differenceInDays(expiry, today);

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

  if (daysUntil <= 30) {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700"
        data-testid="expiration-badge-soon"
      >
        Expires in {daysUntil} day{daysUntil === 1 ? "" : "s"}
      </span>
    );
  }

  if (daysUntil <= 90) {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700"
        data-testid="expiration-badge-upcoming"
      >
        Expires in {daysUntil} days
      </span>
    );
  }

  return null;
}
