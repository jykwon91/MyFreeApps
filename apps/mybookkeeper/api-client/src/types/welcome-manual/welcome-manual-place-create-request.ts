import type { WelcomeManualPriceTier } from "./welcome-manual-price-tier";

/** Body for POST /welcome-manuals/{id}/places. */
export interface WelcomeManualPlaceCreateRequest {
  name: string;
  cuisine: string;
  price_tier?: WelcomeManualPriceTier | null;
  note?: string | null;
  map_url?: string | null;
}
