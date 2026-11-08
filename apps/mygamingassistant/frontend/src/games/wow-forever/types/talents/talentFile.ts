import type { TalentFileTree } from "@/games/wow-forever/types/talents/talentFileTree";

/** `data/talents/<class>.json` — GENERATED from the Forever client by `scripts.wow_talents.build`. */
export interface TalentFile {
  source: string;
  clientBuild: string;
  classId: string;
  /** Left to right, as in game. */
  trees: TalentFileTree[];
}
