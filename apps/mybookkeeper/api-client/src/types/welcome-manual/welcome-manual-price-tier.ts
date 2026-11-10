import { WELCOME_MANUAL_PRICE_TIERS } from "../../constants/welcomeManualLimits";

/** One of the price tiers a place can carry. */
export type WelcomeManualPriceTier = (typeof WELCOME_MANUAL_PRICE_TIERS)[number];
