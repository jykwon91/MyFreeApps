import { COPPER_PER_SILVER } from "@/games/wow-forever/crafting/matPrices";
import type { CrateTier } from "@/games/wow-forever/types/crates/crateTier";

/** The coin a crate pays back when it is handed in, in copper, by its tier (the same for either quality). */
export const CRATE_REFUNDS: Readonly<Record<CrateTier, number>> = {
  apprentice: 5 * COPPER_PER_SILVER,
  journeyman: 10 * COPPER_PER_SILVER,
  expert: 15 * COPPER_PER_SILVER,
  artisan: 20 * COPPER_PER_SILVER,
};
