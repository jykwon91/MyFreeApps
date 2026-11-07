import type { DerivedPrice } from "@/games/wow-forever/types/derivedPrice";

/** A price nobody typed: TradeSkillMaster's auction price, else one worked out from other prices. */
export type AutoPrice = { copper: number; from: "auction" } | DerivedPrice;
