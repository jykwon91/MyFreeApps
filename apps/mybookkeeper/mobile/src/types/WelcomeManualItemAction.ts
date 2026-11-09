import type { WELCOME_MANUAL_ITEM_ACTION } from "../constants/welcomeManuals";

export type WelcomeManualItemAction = (typeof WELCOME_MANUAL_ITEM_ACTION)[keyof typeof WELCOME_MANUAL_ITEM_ACTION];
