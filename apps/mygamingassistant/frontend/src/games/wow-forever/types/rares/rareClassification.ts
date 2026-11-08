import type { RARE_CLASSIFICATION } from "@/games/wow-forever/data/rares/raresConfig";

/** What the Forever client calls the creature: "rare" or "rare elite". */
export type RareClassification = (typeof RARE_CLASSIFICATION)[keyof typeof RARE_CLASSIFICATION];
