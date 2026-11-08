/** One door into a dungeon (an entrance area trigger), where it is on its zone's map. */
export interface DungeonDoor {
  /** Area trigger id — the World Map interiors' entrance key. */
  trigger: number;
  /** Its name ("Armory", "Back door"); "" for a dungeon's main door. */
  wing: string;
  /** Zone-map percent. */
  x: number;
  y: number;
}
