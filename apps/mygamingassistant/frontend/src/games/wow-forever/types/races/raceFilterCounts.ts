import type { RaceFaction } from "@/games/wow-forever/types/races/raceFaction";
import type { RacialStatus } from "@/games/wow-forever/types/races/racialStatus";

/** What each filter chip would show if picked, with the other filters as they are. */
export interface RaceFilterCounts {
  /** Races per faction. */
  faction: Readonly<Record<RaceFaction, number>>;
  /** Racials per status. */
  status: Readonly<Record<RacialStatus, number>>;
  /** Racials Forever changed, added or removed. */
  changed: number;
}
