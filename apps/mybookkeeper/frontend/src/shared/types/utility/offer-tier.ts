import type { UtilityOffer } from "@/shared/types/utility/utility-offer";

/**
 * Offers that are the same decision, grouped.
 *
 * Five providers listing 10.50¢ on a 12-month term at the same rating are not
 * five choices — they are one choice with a provider to pick afterwards.
 * Printing them as five rows buries the stat that actually separates them.
 */
export interface OfferTier {
  /** Identity of the tier: rate, term, and rating together. */
  key: string;
  /** The offer shown expanded — the cheapest exit fee wins the slot. */
  lead: UtilityOffer;
  /** Same rate and term, different provider. */
  alternates: UtilityOffer[];
}
