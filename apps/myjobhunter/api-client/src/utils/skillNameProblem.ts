import { SKILL_NAME_MAX_LENGTH } from "../constants/profileFieldLimits";
import { PROFILE_FORM_PROBLEMS as PROBLEMS } from "../constants/profileFormProblems";
import { tooLongProblem } from "./tooLongProblem";

/** Why a new skill's name can't be saved: blank, too long, or one you have already (in any case). */
export function skillNameProblem(name: string, existingNames: readonly string[]): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return PROBLEMS.skillRequired;
  const lower = trimmed.toLowerCase();
  if (existingNames.some((existing) => existing.toLowerCase() === lower)) return PROBLEMS.skillDuplicate;
  return tooLongProblem(trimmed, SKILL_NAME_MAX_LENGTH);
}
