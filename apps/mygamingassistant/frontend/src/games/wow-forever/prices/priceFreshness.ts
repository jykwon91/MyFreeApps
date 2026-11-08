/**
 * The server refreshes prices every few hours (`wow_price_refresh_interval_hours`),
 * so prices older than this mean several refreshes failed and they may be off.
 */
export const PRICE_STALE_HOURS = 12;

const MS_PER_HOUR = 3_600_000;

/** True when the prices are older than PRICE_STALE_HOURS, or when it isn't known how old they are. */
export function pricesAreOld(sourceUpdatedAt: string | null, now: number): boolean {
  if (sourceUpdatedAt === null) return true;
  const updated = Date.parse(sourceUpdatedAt);
  if (Number.isNaN(updated)) return true;
  return now - updated > PRICE_STALE_HOURS * MS_PER_HOUR;
}
