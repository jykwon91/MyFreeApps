import { REFINEMENT_CONFLICT_CODES } from "../constants/refinementConflictCodes";
import type { SuggestionChangedError } from "../types/resume-refinement/suggestion-changed-error";

/** True for the coded 409 an answer gets when the suggestion it meant had already moved on. */
export function isSuggestionChangedError(err: unknown): err is SuggestionChangedError {
  if (err === null || typeof err !== "object") return false;
  const { status, data } = err as { status?: unknown; data?: unknown };
  if (status !== 409 || data === null || typeof data !== "object") return false;
  const detail = (data as { detail?: unknown }).detail;
  if (detail === null || typeof detail !== "object") return false;
  return (detail as { code?: unknown }).code === REFINEMENT_CONFLICT_CODES.suggestionChanged;
}
