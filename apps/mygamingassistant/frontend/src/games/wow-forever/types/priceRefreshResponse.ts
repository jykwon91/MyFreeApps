/**
 * The answer to "Refresh now" (POST /api/wow/prices/refresh):
 * `started` — the house is being pulled from Blizzard in the background;
 * `cooldown` — it was asked for too recently;
 * `refreshing` — a scheduled refresh is already running, so it lands on its own.
 */
export interface PriceRefreshResponse {
  status: "started" | "cooldown" | "refreshing";
  /** Seconds until the house can be refreshed again (0 while `refreshing`). */
  retry_after_seconds: number;
}
