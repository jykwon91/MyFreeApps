import { REFRESH_INTERVAL_OPTIONS } from "../constants/refreshIntervals";

/** A refresh interval in the short form the schedule line uses, with a general form for non-presets. */
export function refreshIntervalShortLabel(minutes: number): string {
  const preset = REFRESH_INTERVAL_OPTIONS.find((option) => option.minutes === minutes);
  if (preset) return preset.short;
  if (minutes < 60) return `Every ${minutes}m`;
  if (minutes < 1440) return `Every ${Math.round(minutes / 60)}h`;
  const days = Math.round(minutes / 1440);
  return days === 1 ? "Daily" : `Every ${days}d`;
}
