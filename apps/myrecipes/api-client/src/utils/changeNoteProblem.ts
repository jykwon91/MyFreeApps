import { tooLongProblem } from "@platform/core/utils/tooLongProblem";
import { CHANGE_NOTE_MAX_LENGTH, RECIPE_FORM_PROBLEMS } from "../constants/recipeForm";
import type { RecipeProblemScope } from "../types/recipe/recipe-problem-scope";

/** What's wrong with a tweak's "what did you change?" note: it's required, and has a limit. */
export function changeNoteProblem(changeNote: string, scope: RecipeProblemScope = {}): string | undefined {
  const note = changeNote.trim();
  const tooLong = tooLongProblem(note, CHANGE_NOTE_MAX_LENGTH);
  if (tooLong || scope.lengthsOnly) return tooLong;
  return note === "" ? RECIPE_FORM_PROBLEMS.changeNoteRequired : undefined;
}
