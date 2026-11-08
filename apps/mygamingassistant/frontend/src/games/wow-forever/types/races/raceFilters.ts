import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { RaceFaction } from "@/games/wow-forever/types/races/raceFaction";
import type { RacialStatus } from "@/games/wow-forever/types/races/racialStatus";

/** The races page's filters (kept in the URL). */
export interface RaceFilters {
  /** null = both factions. */
  faction: RaceFaction | null;
  /** Only races that can be this class; null = any. */
  classId: WowClassId | null;
  /** Only racials with this status; null = any. */
  status: RacialStatus | null;
  /** Only racials Forever changed, added or removed. */
  changedOnly: boolean;
}
