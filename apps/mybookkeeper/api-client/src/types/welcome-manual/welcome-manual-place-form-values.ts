import type { WelcomeManualPriceTier } from "./welcome-manual-price-tier";

/** Editable text of one "Where to Eat" place; an empty price_tier means no tier. */
export interface WelcomeManualPlaceFormValues {
  name: string;
  cuisine: string;
  price_tier: WelcomeManualPriceTier | "";
  note: string;
  map_url: string;
}
