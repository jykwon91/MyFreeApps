import { REFRESH_INTERVAL_OPTIONS } from "@myjobhunter/api-client/constants/refreshIntervals";
import type { SheetOption } from "@platform/mobile";

/** The refresh intervals as the phone's choice lists hold them: by their minutes, written out. */
export const REFRESH_FREQUENCY_OPTIONS: readonly SheetOption<string>[] = REFRESH_INTERVAL_OPTIONS.map((option) => ({
  value: String(option.minutes),
  label: option.label,
}));
