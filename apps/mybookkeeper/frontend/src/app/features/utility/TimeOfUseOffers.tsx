import TimeOfUseOfferRow from "@/app/features/utility/TimeOfUseOfferRow";
import type { UtilityOffer } from "@/shared/types/utility/utility-offer";

export interface TimeOfUseOffersProps {
  offers: UtilityOffer[];
  withheldLowRatedCount: number;
  propertyId: string;
}

/**
 * Plans priced by time of day, listed without a ranking.
 *
 * These used to be dropped before they reached the operator, on the reasoning
 * that a blended rate is not comparable to a flat one. That reasoning is sound
 * and the conclusion was not: it hid an entire product category, including
 * five-star plans, behind a comparison the app was unable to make. So they are
 * shown, in their own list, with the missing comparison stated rather than
 * papered over with a number.
 */
export default function TimeOfUseOffers({
  offers,
  withheldLowRatedCount,
  propertyId,
}: TimeOfUseOffersProps) {
  if (offers.length === 0 && withheldLowRatedCount === 0) return null;

  return (
    <section
      className="mt-4 pt-4 border-t border-border"
      data-testid={`time-of-use-offers-${propertyId}`}
    >
      <h4 className="text-sm font-semibold">Plans that price by time of day</h4>
      <p className="text-xs text-muted-foreground mt-0.5">
        Free nights, free weekends, off-peak discounts. Whether one of these
        beats your current plan depends on <em>when</em> you use power, and your
        bills only record how much — so nothing here carries a savings figure.
        Read the terms against your own habits.
      </p>

      {offers.length > 0 ? (
        <ul className="space-y-3 mt-3">
          {offers.map((offer) => (
            <TimeOfUseOfferRow key={offer.external_plan_id} offer={offer} />
          ))}
        </ul>
      ) : null}

      {withheldLowRatedCount > 0 ? (
        <p
          className="text-xs text-muted-foreground mt-3"
          data-testid={`time-of-use-withheld-${propertyId}`}
        >
          {withheldLowRatedCount} more{" "}
          {withheldLowRatedCount === 1 ? "plan" : "plans"} hidden — poorly rated
          or unrated providers.
        </p>
      ) : null}
    </section>
  );
}
