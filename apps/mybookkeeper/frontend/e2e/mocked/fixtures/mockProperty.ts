/** Two houses, as GET /properties returns them, for no-backend specs. MAIN_HOUSE is LISTING's house. */
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import { LISTING_SUMMARY } from "./mockListing";

function house(id: string, name: string): Property {
  return {
    id,
    name,
    address: null,
    classification: "investment",
    type: null,
    is_active: true,
    activity_periods: [],
    created_at: "2026-01-01T00:00:00Z",
  };
}

export const MAIN_HOUSE = house(LISTING_SUMMARY.property_id ?? "prop-1", "Main House");
export const BACK_COTTAGE = house("prop-2", "Back Cottage");
export const HOUSES: Property[] = [MAIN_HOUSE, BACK_COTTAGE];
