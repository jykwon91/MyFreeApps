import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { BisListPhase } from "@/games/wow-forever/data/bisLists/bisListPhases";
import type { BisListItems } from "@/games/wow-forever/types/bisLists/bisListItems";

/** What a share link carries: the list without anything personal to this browser. */
export interface SharedBisList {
  name: string;
  classId: WowClassId;
  /** Always a real spec of the class. */
  specId: string;
  phase: BisListPhase;
  items: BisListItems;
}
