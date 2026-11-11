import { REFRESH_INTERVAL_OPTIONS } from "../constants/refreshIntervals";
import { refreshIntervalShortLabel } from "./refreshIntervalShortLabel";

/** A refresh interval as its picker names it, like "Twice daily". */
export function refreshIntervalLabel(minutes: number): string {
  return REFRESH_INTERVAL_OPTIONS.find((option) => option.minutes === minutes)?.label ?? refreshIntervalShortLabel(minutes);
}
