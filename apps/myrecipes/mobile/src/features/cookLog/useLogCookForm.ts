import { COOK_LOG_MESSAGES as SHARED } from "@myrecipes/api-client/constants/cookLog";
import { useLogCookMutation } from "@myrecipes/api-client/store/recipesApi";
import type { CookLogFormValues } from "@myrecipes/api-client/types/recipe/cook-log-form-values";
import { buildCookLogCreateRequest } from "@myrecipes/api-client/utils/buildCookLogCreateRequest";
import { cookNotesProblem } from "@myrecipes/api-client/utils/cookNotesProblem";
import { useToast } from "@platform/mobile";
import { useState } from "react";

const EMPTY_COOK: CookLogFormValues = { rating: null, notes: "" };

/**
 * Logging a cook of a version, as the website's "I made it" dialog does: an optional rating and notes,
 * the same request. Notes past the limit say so as they're typed and can't be saved. A failed save
 * says so at the top of the sheet and keeps what was entered. The log's cache tags refresh the cook
 * log, the recipe's best rating and last cooked, and the list's cards.
 */
export function useLogCookForm(recipeId: string, versionId: string, onSaved: () => void) {
  const { showToast } = useToast();
  const [logCook, { isLoading: isSaving }] = useLogCookMutation();
  const [values, setValues] = useState<CookLogFormValues>(EMPTY_COOK);
  const [failure, setFailure] = useState<string | null>(null);

  const notesProblem = cookNotesProblem(values.notes);

  function setRating(rating: number): void {
    setValues((current) => ({ ...current, rating }));
  }

  function setNotes(notes: string): void {
    setValues((current) => ({ ...current, notes }));
  }

  async function save(): Promise<void> {
    if (isSaving || notesProblem) return;
    setFailure(null);
    try {
      await logCook({ recipeId, versionId, body: buildCookLogCreateRequest(values) }).unwrap();
      onSaved();
      showToast(SHARED.logged);
    } catch {
      setFailure(SHARED.couldntLog);
    }
  }

  return { values, notesProblem, failure, isSaving, setRating, setNotes, save };
}
