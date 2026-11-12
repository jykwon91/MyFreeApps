import { SAVED_SEARCH_NAME_MAX_LENGTH } from "../constants/textFieldLimits";
import { tooLongProblem } from "@platform/core/utils/tooLongProblem";

/** Why a saved search's name is too long to save, or undefined. Blank is fine: the name is optional. */
export function savedSearchNameProblem(name: string): string | undefined {
  return tooLongProblem(name.trim(), SAVED_SEARCH_NAME_MAX_LENGTH);
}
