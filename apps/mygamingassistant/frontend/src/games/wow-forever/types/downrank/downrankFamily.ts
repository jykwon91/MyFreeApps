import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { DownrankKind } from "@/games/wow-forever/types/downrank/downrankKind";
import type { DownrankRank } from "@/games/wow-forever/types/downrank/downrankRank";
import type { DownrankTargets } from "@/games/wow-forever/types/downrank/downrankTargets";

/** A spell and all its ranks, e.g. Priest "Heal" Ranks 1–4. */
export interface DownrankFamily {
  /** Stable id, e.g. "priest-heal" — it's in links (`?spell=`). */
  id: string;
  classId: WowClassId;
  name: string;
  kind: DownrankKind;
  targets: DownrankTargets;
  /** Icon file id; 0 = none. */
  icon: number;
  /** The Changes vs Classic feed lists this spell as changed. */
  changedInForever: boolean;
  ranks: readonly DownrankRank[];
}
