import type { SuggestPlaceholdersResponse } from "@mybookkeeper/api-client/types/lease/suggest-placeholders-response";

const waiting = new Map<string, SuggestPlaceholdersResponse>();

/** Keeps what the AI found for a template just uploaded, for the screen that opens next. A route can't carry it. */
export function holdSuggestions(templateId: string, suggestions: SuggestPlaceholdersResponse): void {
  waiting.set(templateId, suggestions);
}

/** Hands the suggestions over once; they aren't shown again on a later visit. */
export function takeSuggestions(templateId: string): SuggestPlaceholdersResponse | null {
  const suggestions = waiting.get(templateId) ?? null;
  waiting.delete(templateId);
  return suggestions;
}
