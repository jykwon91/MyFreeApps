/** The zone a dungeon's door (or doors) are in. */
export interface DungeonEntranceZone {
  /** uiMapID — the World Map's `?m=`. */
  zoneId: number;
  zoneName: string;
  /** Named doors in this zone ("Armory", "Back door"); empty for a dungeon's one door. */
  wings: readonly string[];
  /** The area the door is in ("The Dagger Hills"), when it has one. */
  subzone: string;
}
