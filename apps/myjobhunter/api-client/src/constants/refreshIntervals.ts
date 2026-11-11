import type { RefreshIntervalOption } from "../types/discovery/refresh-interval-option";

/**
 * Preset refresh intervals for a saved search. Cron strings are a footgun (off-by-one, timezones,
 * "every 5 minutes" burning the JSearch quota), so the picker offers these. The backend allows
 * 15-10080 minutes; sub-hourly is left out to keep the quota predictable.
 */
export const REFRESH_INTERVAL_OPTIONS: readonly RefreshIntervalOption[] = [
  { minutes: 120, label: "Every 2 hours", short: "Every 2h" },
  { minutes: 360, label: "Every 6 hours", short: "Every 6h" },
  { minutes: 720, label: "Twice daily", short: "Twice daily" },
  { minutes: 1440, label: "Daily", short: "Daily" },
];

/** Daily: the right answer for most saved searches. */
export const DEFAULT_REFRESH_INTERVAL_MINUTES = 1440;
