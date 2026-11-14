import { tooLongProblem } from "@platform/core/utils/tooLongProblem";
import { COOK_NOTES_MAX_LENGTH } from "../constants/cookLog";

/** Why a cook's notes can't be saved — only when they're too long, counted on what is sent (trimmed). */
export function cookNotesProblem(notes: string): string | undefined {
  return tooLongProblem(notes.trim(), COOK_NOTES_MAX_LENGTH);
}
