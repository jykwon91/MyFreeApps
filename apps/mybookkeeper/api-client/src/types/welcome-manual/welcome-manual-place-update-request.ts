import type { WelcomeManualPriceTier } from "./welcome-manual-price-tier";

/** Body for PATCH /welcome-manuals/{id}/places/{placeId}. Only dirty fields are sent. */
export interface WelcomeManualPlaceUpdateRequest {
  name?: string;
  cuisine?: string;
  price_tier?: WelcomeManualPriceTier | null;
  note?: string | null;
  map_url?: string | null;
  display_order?: number;
}
