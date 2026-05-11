/** Preset refresh-interval options for the "How often" picker.
 *
 * Cron strings are a footgun for non-technical operators (off-by-one,
 * timezone confusion, "every 5 minutes" → quota burn). A small preset
 * list covers the realistic cadence range:
 *
 * - ``Every 2 hours`` (120m) — aggressive; for hot-pipeline searches
 * - ``Every 6 hours`` (360m) — balanced
 * - ``Twice daily`` (720m)   — most operators
 * - ``Daily`` (1440m)        — default; the right answer for most cases
 *
 * Backend allows 15-10080 minutes; we deliberately omit sub-hourly
 * options to keep JSearch quota predictable. If an operator needs
 * higher cadence, the backend's CHECK constraint floor (15 minutes)
 * is the documented escape hatch — they can call the API directly.
 */
export interface RefreshIntervalOption {
  /** Backend ``fetch_interval_minutes`` value. */
  minutes: number;
  /** Human-readable label for the picker. */
  label: string;
  /** Short human-readable form used in the SavedSearchRow status line. */
  short: string;
}

export const REFRESH_INTERVAL_OPTIONS: ReadonlyArray<RefreshIntervalOption> = [
  { minutes: 120, label: "Every 2 hours", short: "Every 2h" },
  { minutes: 360, label: "Every 6 hours", short: "Every 6h" },
  { minutes: 720, label: "Twice daily", short: "Twice daily" },
  { minutes: 1440, label: "Daily", short: "Daily" },
];

export const DEFAULT_REFRESH_INTERVAL_MINUTES = 1440;

/** Return the short human-readable label for a given interval.
 *
 * Falls back to a generic "Every Xh" / "Every Xd" form when the value
 * isn't one of the presets (a future API change could land custom
 * values from elsewhere).
 */
export function refreshIntervalShortLabel(minutes: number): string {
  const preset = REFRESH_INTERVAL_OPTIONS.find((o) => o.minutes === minutes);
  if (preset) return preset.short;
  if (minutes < 60) return `Every ${minutes}m`;
  if (minutes < 1440) {
    const hours = Math.round(minutes / 60);
    return `Every ${hours}h`;
  }
  const days = Math.round(minutes / 1440);
  return days === 1 ? "Daily" : `Every ${days}d`;
}
