/** `GET /api/wow/prices/refresh?server=&faction=`: what "Refresh now" needs to know about one auction house. */
export interface PriceRefreshState {
  /** ISO time Blizzard took the snapshot behind the stored prices; null = no prices yet. */
  source_updated_at: string | null;
  /** ISO time we last stored a download of this house. Moves on every successful refresh, newer snapshot or not. */
  fetched_at: string | null;
  /** ISO time "Refresh now" works again; null = now. */
  refresh_available_at: string | null;
  /** ISO time of the last failed refresh; null once a later one worked. Changes with each failed try. */
  refresh_failed_at: string | null;
}
