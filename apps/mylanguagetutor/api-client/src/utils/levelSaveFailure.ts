import { httpStatus } from "@platform/core/utils/httpStatus";
import { writeOutcome } from "@platform/core/utils/writeOutcome";
import type { LevelSaveFailure } from "../types/onboarding/level-save-failure";

const HTTP_UNPROCESSABLE = 422;

/** Why a level save failed: a language the server doesn't know, a lost answer it may have survived, or a plain refusal. */
export function levelSaveFailure(error: unknown): LevelSaveFailure {
  if (httpStatus(error) === HTTP_UNPROCESSABLE) return "language";
  return writeOutcome(error) === "unknown" ? "unsure" : "failed";
}
