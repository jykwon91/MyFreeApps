import { writeOutcome } from "@platform/core/utils/writeOutcome";
import type { LevelSaveFailure } from "../types/onboarding/level-save-failure";

/** Whether a failed level save is a real failure or a lost answer it may have survived. */
export function levelSaveFailure(error: unknown): LevelSaveFailure {
  return writeOutcome(error) === "unknown" ? "unsure" : "failed";
}
