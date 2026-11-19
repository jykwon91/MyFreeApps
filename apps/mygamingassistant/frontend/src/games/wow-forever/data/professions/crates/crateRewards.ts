import type { CrateQuality } from "@/games/wow-forever/types/crates/crateQuality";
import type { CrateTier } from "@/games/wow-forever/types/crates/crateTier";

/** How many rewards a crate pays, by its tier and its item quality ("common" is the normal crate). */
export const CRATE_REWARDS: Readonly<Record<CrateTier, Readonly<Record<CrateQuality, number>>>> = {
  apprentice: { common: 5, uncommon: 10 },
  journeyman: { common: 10, uncommon: 20 },
  expert: { common: 15, uncommon: 30 },
  artisan: { common: 20, uncommon: 40 },
};
