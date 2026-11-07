import type { BisListPhase } from "@/games/wow-forever/data/bisLists/bisListPhases";
import type { BisListStart } from "@/games/wow-forever/data/bisLists/bisListStartOptions";
import type { WowClassId } from "@/games/wow-forever/data/classes";

/** The "New list" form as filled in so far. */
export interface BisListDraft {
  /** Blank = use the suggested name. */
  name: string;
  classId: WowClassId;
  specId: string;
  phase: BisListPhase;
  start: BisListStart;
  /** Leveling + recommended only: the level the picks are for. Null = not entered. */
  level: number | null;
}
