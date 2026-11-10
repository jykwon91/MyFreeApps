import { WELCOME_MANUAL_PRICE_TIERS } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import type { WelcomeManualPriceTier } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-price-tier";
import { WELCOME_MANUAL_PLACE_MESSAGES } from "../../constants/welcomeManualForms";

/** "None" first, then each tier. An empty value is no tier at all. */
export const PRICE_SEGMENTS: readonly { value: WelcomeManualPriceTier | ""; label: string }[] = [
  { value: "", label: WELCOME_MANUAL_PLACE_MESSAGES.noPrice },
  ...WELCOME_MANUAL_PRICE_TIERS.map((tier) => ({ value: tier, label: tier })),
];
