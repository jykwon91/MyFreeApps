/** Where a writ was handed in, recorded in game by MGA Dungeon Quests. */
export interface WritTurnIn {
  zone: string;
  map: number;
  x: number;
  y: number;
  /** YYYY-MM-DD. */
  seen: string;
  faction: "alliance" | "horde";
}
