import { formatOfferRate } from "@/shared/lib/utility-offer-format";
import type { UtilityOffer } from "@/shared/types/utility/utility-offer";

export interface OfferDisclosureProps {
  offer: UtilityOffer;
}

/**
 * The fine print, folded away.
 *
 * The three disclosure prices matter — a single headline rate is exactly what a
 * bill-credit plan is designed to game — but printing them on every card turns
 * the comparison into a wall of near-identical numbers. The teaser warning above
 * already says when they diverge; this is where the operator checks that claim.
 */
export default function OfferDisclosure({ offer }: OfferDisclosureProps) {
  return (
    <details className="mt-3">
      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
        Price detail
      </summary>
      <p className="text-xs text-muted-foreground mt-2">
        At 500 / 1000 / 2000 kWh:{" "}
        {formatOfferRate(offer.price_cents_per_kwh_at_500)} /{" "}
        {formatOfferRate(offer.price_cents_per_kwh_at_1000)} /{" "}
        {formatOfferRate(offer.price_cents_per_kwh_at_2000)}
      </p>
      {offer.fact_sheet_url ? (
        <p className="text-xs mt-1">
          <a
            href={offer.fact_sheet_url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary hover:underline"
          >
            Electricity Facts Label
          </a>
        </p>
      ) : null}
    </details>
  );
}
