import type { WritTier } from "@/games/wow-forever/types/writs/writTier";

/** A writ is a deal when writ + item cost strictly less than this many copper. */
export const WRIT_DEAL_THRESHOLD: Readonly<Record<WritTier, number>> = {
  journeyman: 5_000,
  expert: 10_000,
  artisan: 20_000,
};

/** The thresholds in words, for screen readers. */
export const WRIT_DEAL_THRESHOLD_LABEL: Readonly<Record<WritTier, string>> = {
  journeyman: "50 silver",
  expert: "1 gold",
  artisan: "2 gold",
};
