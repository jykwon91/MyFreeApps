/** The rares list's filters (kept in the URL). */
export interface RareFilters {
  /** uiMapId; null = every zone. */
  zoneId: number | null;
  minLevel: number | null;
  maxLevel: number | null;
  /** Only rares near the player's saved level. */
  fitsMyLevel: boolean;
  /** Only rares the Forever client has met. */
  confirmedOnly: boolean;
}
