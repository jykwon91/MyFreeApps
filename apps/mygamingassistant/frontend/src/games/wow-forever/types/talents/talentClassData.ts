import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

/** A class's talent trees, ready for the calculator. */
export interface TalentClassData {
  classId: WowClassId;
  clientBuild: string;
  trees: readonly TalentTree[];
}
