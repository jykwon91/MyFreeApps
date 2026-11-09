import type { WelcomeManualPriceTier } from "./welcome-manual-price-tier";

/** What the guest has narrowed the places to. null for a cuisine or price tier means no filter. */
export interface WelcomeManualPlaceFilters {
  search: string;
  cuisine: string | null;
  priceTier: WelcomeManualPriceTier | null;
}
