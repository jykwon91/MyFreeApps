/**
 * Collapse offers that represent the same decision into one tier each.
 *
 * Pure. The API already ranks offers; this only decides which of them are
 * genuinely distinct choices to put in front of the operator.
 */
import type { OfferTier } from "@/shared/types/utility/offer-tier";
import type { UtilityOffer } from "@/shared/types/utility/utility-offer";

/**
 * What makes two offers the same decision.
 *
 * Exit fee is deliberately NOT part of the key — it is the stat that separates
 * otherwise-identical offers, so it decides which one leads the tier rather
 * than splitting the tier in two.
 */
function tierKey(offer: UtilityOffer): string {
  return [
    Number(offer.price_cents_per_kwh_at_1000).toFixed(2),
    offer.term_months,
    offer.provider_rating ?? "unrated",
    offer.is_teaser_priced ? "teaser" : "flat",
  ].join("|");
}

/** Lower is better; an unpublished fee sorts last because it is not good news. */
function exitFeeRank(offer: UtilityOffer): number {
  if (offer.cancellation_fee_cents === null) return Number.MAX_SAFE_INTEGER;
  if (!offer.cancellation_fee_is_per_remaining_month) return offer.cancellation_fee_cents;
  // A per-remaining-month fee is worth its whole remaining term, so compare it
  // at the term it applies to rather than at one month's face value.
  return offer.cancellation_fee_cents * offer.term_months;
}

export function buildOfferTiers(offers: UtilityOffer[]): OfferTier[] {
  const byKey = new Map<string, UtilityOffer[]>();
  for (const offer of offers) {
    const key = tierKey(offer);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(offer);
    else byKey.set(key, [offer]);
  }

  return [...byKey.entries()].map(([key, bucket]) => {
    const sorted = [...bucket].sort((a, b) => exitFeeRank(a) - exitFeeRank(b));
    return { key, lead: sorted[0], alternates: sorted.slice(1) };
  });
}
