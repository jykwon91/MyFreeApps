import type { CookLogCreateRequest } from "../types/recipe/cook-log";
import type { CookLogFormValues } from "../types/recipe/cook-log-form-values";

/** The body that logs a cook: the rating, and the notes trimmed, or null when blank. The server dates it now. */
export function buildCookLogCreateRequest(values: CookLogFormValues): CookLogCreateRequest {
  return { rating: values.rating, outcome_notes: values.notes.trim() || null };
}
