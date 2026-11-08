/** Where a new character of a race starts, and where that claim comes from. */
export interface RaceStartZone {
  name: string;
  /** The World Map zone, for "Show on the World Map"; null when the map has no such zone. */
  uiMapId: number | null;
  /** Classic's starting zone (Classic data), or one no game file states (Unconfirmed). */
  basis: "classic" | "unconfirmed";
}
