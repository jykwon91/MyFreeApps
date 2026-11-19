import type { WritTier } from "@/games/wow-forever/types/writs/writTier";

/** Lowest rank first: this is also the order the Tier column sorts in. */
export const WRIT_TIERS: readonly WritTier[] = ["journeyman", "expert", "artisan"];

export const WRIT_TIER_LABEL: Readonly<Record<WritTier, string>> = {
  journeyman: "Journeyman",
  expert: "Expert",
  artisan: "Artisan",
};
