import type { PlayerFaction, WorldPoint, WorldZone } from "@/games/wow-forever/types/worldMap";

/** Who is buying and where they stand — what "nearest vendor" is measured from. */
export interface VendorPlace {
  faction: PlayerFaction;
  /** Your saved spot (the middle of your zone when no spot is set); null when no zone is set or zones haven't loaded. */
  here: WorldPoint | null;
  /** Forever's zones by id, to place each vendor in the world. Empty until loaded. */
  zoneById: ReadonlyMap<number, WorldZone>;
}
