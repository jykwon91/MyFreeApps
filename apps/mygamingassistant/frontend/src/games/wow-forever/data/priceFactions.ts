import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";

/** Every faction prices are kept for, in the order the backend lists them. */
export const PRICE_FACTIONS: readonly PriceFaction[] = ["alliance", "horde", "neutral"];

/** The house's name as the game shows it ("Blackwater" = the neutral goblin houses). */
export const PRICE_FACTION_LABEL: Readonly<Record<PriceFaction, string>> = {
  alliance: "Alliance",
  horde: "Horde",
  neutral: "Blackwater",
};

/** Prices are US only (the server keeps no other region). */
export const AUCTION_PRICE_REGION_LABEL = "US";
