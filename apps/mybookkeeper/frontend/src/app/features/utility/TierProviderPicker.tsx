import { formatCancellationFee } from "@/shared/lib/utility-offer-format";
import type { UtilityOffer } from "@/shared/types/utility/utility-offer";

export interface TierProviderPickerProps {
  alternates: UtilityOffer[];
}

/**
 * The other providers selling this same rate and term.
 *
 * They are not separate decisions — the rate, term and rating are identical, so
 * printing a full stat block for each would say the same thing five times. The
 * one stat that does differ is what it costs to leave, so that is what each
 * line carries, cheapest first.
 */
export default function TierProviderPicker({ alternates }: TierProviderPickerProps) {
  if (alternates.length === 0) return null;

  return (
    <details className="mt-3">
      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
        {alternates.length} other {alternates.length === 1 ? "provider" : "providers"} at
        this rate
      </summary>
      <ul className="mt-2 space-y-1.5">
        {alternates.map((offer) => (
          <li
            key={offer.external_plan_id}
            className="flex items-center justify-between gap-3 text-xs"
            data-testid={`tier-alternate-${offer.external_plan_id}`}
          >
            <span className="min-w-0 truncate">
              {offer.provider_name}
              <span className="text-muted-foreground"> · {offer.plan_name}</span>
            </span>
            <span className="shrink-0 flex items-center gap-3">
              <span className="text-muted-foreground">
                {formatCancellationFee(
                  offer.cancellation_fee_cents,
                  offer.cancellation_fee_is_per_remaining_month,
                )}
              </span>
              {offer.enroll_url ? (
                <a
                  href={offer.enroll_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary hover:underline"
                >
                  Sign up
                </a>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
