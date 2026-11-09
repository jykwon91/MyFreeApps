import type { SuggestedPlaceholderItem } from "../types/lease/suggested-placeholder-item";
import type { LeaseSuggestionSplit } from "../types/lease/lease-suggestion-split";

/**
 * Which AI suggestions the template already has a placeholder for (the bracket detector found it too),
 * and which are new to it.
 */
export function splitSuggestions(suggestions: readonly SuggestedPlaceholderItem[], savedKeys: ReadonlySet<string>): LeaseSuggestionSplit {
  const newKeys = new Set(suggestions.filter((suggestion) => !savedKeys.has(suggestion.key)).map((suggestion) => suggestion.key));
  return { newKeys, matchedCount: suggestions.length - newKeys.size };
}
