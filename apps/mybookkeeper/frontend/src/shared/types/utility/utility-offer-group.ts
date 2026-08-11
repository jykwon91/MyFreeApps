import type { UtilityOffer } from "@/shared/types/utility/utility-offer";

/**
 * Offers for one property, measured against the plan it holds today.
 *
 * Mirrors `backend/app/schemas/properties/utility_offer_group.py`.
 */
export interface UtilityOfferGroup {
  property_id: string;
  property_name: string | null;
  zip_code: string | null;
  current_provider_name: string | null;
  current_price_cents_per_kwh_at_1000: string | null;
  /** `null` means the exit cost is unknown — must never render as free. */
  switch_cost_cents: number | null;
  offers: UtilityOffer[];
  /** Cheaper offers held back for failing the provider-rating bar. */
  withheld_low_rated_count: number;
  /** Why there is nothing to show. Rendered instead of an empty list. */
  unavailable_reason: string | null;
}
