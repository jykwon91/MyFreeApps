/** Where a quest goes back to: the one NPC (or object) that takes it, placed on a zone map. */
export interface TurnInSpot {
  name: string;
  /** The World Map zone (uiMapId). */
  zoneId: number;
  zoneName: string;
  subzone: string | null;
  /** Map percent, 0-100. */
  x: number;
  y: number;
}
