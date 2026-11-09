import type { WelcomeManualPlaceFilters } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-place-filters";
import type { WelcomeManualPriceTier } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-price-tier";

export interface WelcomeManualPlaceFilterSheetProps {
  filters: WelcomeManualPlaceFilters;
  /** Only the cuisines some place uses. */
  cuisines: readonly string[];
  /** Only the price tiers some place carries. */
  priceTiers: readonly WelcomeManualPriceTier[];
  onChange: (filters: WelcomeManualPlaceFilters) => void;
  onClose: () => void;
}
