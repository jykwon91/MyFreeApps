import OfferDisclosure from "@/app/features/utility/OfferDisclosure";
import OfferEnrollLink from "@/app/features/utility/OfferEnrollLink";
import {
  formatCancellationFeeShort,
  formatOfferRate,
  formatProviderRating,
  formatTerm,
} from "@/shared/lib/utility-offer-format";
import type { UtilityOffer } from "@/shared/types/utility/utility-offer";

export interface TimeOfUseOfferRowProps {
  offer: UtilityOffer;
}

/**
 * One time-of-use plan, stated as terms to read rather than a saving to take.
 *
 * Deliberately not an `OfferTierCard`: no saving headline, no verdict badge, no
 * "best value" marker. Every one of those would be a claim about money, and the
 * comparison that would justify one needs to know when the household draws
 * power. What the operator gets instead is the provider's own description of
 * the free window, the rate outside it, and the label that binds both.
 */
export default function TimeOfUseOfferRow({ offer }: TimeOfUseOfferRowProps) {
  return (
    <li
      className="rounded-lg border border-border p-4"
      data-testid={`time-of-use-plan-${offer.external_plan_id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium min-w-0 truncate">
          {offer.provider_name}
          <span className="text-muted-foreground font-normal">
            {" · "}
            {offer.plan_name}
          </span>
        </p>
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
          {formatProviderRating(offer.provider_rating)}
        </span>
      </div>

      {offer.special_terms ? (
        <p
          className="text-sm mt-2"
          data-testid={`time-of-use-terms-${offer.external_plan_id}`}
        >
          {offer.special_terms}
        </p>
      ) : (
        <p
          className="text-sm mt-2 text-muted-foreground"
          data-testid={`time-of-use-terms-${offer.external_plan_id}`}
        >
          This provider didn't publish a description of the free window — the
          Electricity Facts Label below states it.
        </p>
      )}

      {/* "Average" is doing load-bearing work: this is the blended disclosure
          price, and printing it the way a flat plan's rate is printed would
          invite exactly the comparison this section exists to avoid. */}
      <p className="text-xs text-muted-foreground mt-2">
        {formatTerm(offer.term_months)}
        {" · "}
        {formatOfferRate(offer.price_cents_per_kwh_at_1000)} average
        {" · "}
        {formatCancellationFeeShort(
          offer.cancellation_fee_cents,
          offer.cancellation_fee_is_per_remaining_month,
        )}
      </p>

      {offer.enroll_url ? (
        <p className="mt-3">
          {/* Never `primary`: nothing in this list has been ranked against the
              others on money, so none of them is the recommended one. */}
          <OfferEnrollLink
            href={offer.enroll_url}
            providerName={offer.provider_name}
            tone="secondary"
            testId={`time-of-use-enroll-${offer.external_plan_id}`}
          />
        </p>
      ) : null}

      <OfferDisclosure offer={offer} />
    </li>
  );
}
