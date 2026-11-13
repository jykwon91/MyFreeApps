import type { Lineup } from "@/types/game";

/** Lineups sharing one target zone, as rendered by the lineup boards. */
export interface ZoneGroup {
  zoneName: string;
  zoneSlug: string;
  lineups: Lineup[];
}
