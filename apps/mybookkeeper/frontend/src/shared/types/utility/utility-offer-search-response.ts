import type { UtilityOfferGroup } from "@/shared/types/utility/utility-offer-group";

/**
 * Mirrors `backend/app/schemas/properties/utility_offer_search_response.py`.
 */
export interface UtilityOfferSearchResponse {
  groups: UtilityOfferGroup[];
  /**
   * Usage the savings figures were computed at. Shown to the operator so a
   * saving reads as "at this reference usage", not as a promise about a bill.
   */
  reference_annual_kwh: number;
  has_any_offers: boolean;
}
