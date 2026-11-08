import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { RaceFaction } from "@/games/wow-forever/types/races/raceFaction";
import type { RaceStartZone } from "@/games/wow-forever/types/races/raceStartZone";
import type { Racial } from "@/games/wow-forever/types/races/racial";

/** A playable race in the Forever client. */
export interface Race {
  id: number;
  /** URL slug (`/wow-forever/races/<slug>`, `#<slug>`). Never change — it's a link. */
  slug: string;
  name: string;
  faction: RaceFaction;
  /** Not a playable race in Classic Era. */
  newInForever: boolean;
  classes: readonly WowClassId[];
  /** Classes this race can be in Forever but not in Classic Era. */
  newClasses: readonly WowClassId[];
  startZone: RaceStartZone | null;
  /** Removed racials last; actives before passives. */
  racials: readonly Racial[];
}
