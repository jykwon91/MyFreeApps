import type { TrainerNpc } from "@/games/wow-forever/data/professions/professionTypes";

export const RANK_PROFESSIONS = [
  "tailoring",
  "enchanting",
  "alchemy",
  "blacksmithing",
  "leatherworking",
  "engineering",
  "cooking",
  "fishing",
  "firstaid",
] as const;
export type RankProfession = (typeof RANK_PROFESSIONS)[number];

export const RANK_NAMES = ["Journeyman", "Expert", "Artisan"] as const;
export type RankName = (typeof RANK_NAMES)[number];

/** A trainer who teaches a rank, with the map area it stands in. */
export interface RankTrainer extends TrainerNpc {
  /** The World Map zone (city or town zone) they stand in. */
  zoneId: number;
  /** Stands in a capital city. */
  city: boolean;
}
