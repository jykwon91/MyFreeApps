import { LEVEL_OPTIONS } from "../constants/levelOptions";
import type { Level } from "../types/tutor/level";

/** The onboarding label for a level, or the raw value for one this build doesn't know. */
export function levelLabel(level: Level): string {
  return LEVEL_OPTIONS.find((option) => option.value === level)?.label ?? level;
}
