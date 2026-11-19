import type { CrateTier } from "@/games/wow-forever/types/crates/crateTier";

/** Lowest rank first: this is also the order the Tier column sorts in. */
export const CRATE_TIERS: readonly CrateTier[] = ["apprentice", "journeyman", "expert", "artisan"];

export const CRATE_TIER_LABEL: Readonly<Record<CrateTier, string>> = {
  apprentice: "Apprentice",
  journeyman: "Journeyman",
  expert: "Expert",
  artisan: "Artisan",
};
