import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

/** A class's talent trees, ready for the calculator. */
export interface TalentClassData {
  classId: WowClassId;
  /** The game build of the Game Data API the trees were read from. */
  apiBuild: string;
  trees: readonly TalentTree[];
}
