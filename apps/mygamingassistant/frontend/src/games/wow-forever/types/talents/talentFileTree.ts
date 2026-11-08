import type { TalentFileTalent } from "@/games/wow-forever/types/talents/talentFileTalent";

/** One talent tree as `data/talents/<class>.json` stores it, talents in tier then column order. */
export interface TalentFileTree {
  id: number;
  name: string;
  icon: number;
  talents: TalentFileTalent[];
}
