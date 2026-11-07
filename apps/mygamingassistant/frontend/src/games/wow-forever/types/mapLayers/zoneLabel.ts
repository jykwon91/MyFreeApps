/** A zone's name + level range, placed on a continent map (x / y in that map's percent). */
export interface ZoneLabel {
  zoneId: number;
  name: string;
  /** "5–10", "City", "New in Forever" or "" when the client gives no range. */
  detail: string;
  x: number;
  y: number;
  /** Bigger zones claim their spot first when labels would overlap. */
  priority: number;
}
