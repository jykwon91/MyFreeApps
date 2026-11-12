import type { TalentFileTree } from "@/games/wow-forever/types/talents/talentFileTree";

/** `data/talents/<class>.json` — GENERATED from Blizzard's Game Data API by `scripts.wow_talents.build`. */
export interface TalentFile {
  source: string;
  /** The API's game build, e.g. `1.60.1.70399`. */
  apiBuild: string;
  classId: string;
  /** Left to right, as in game. */
  trees: TalentFileTree[];
}
