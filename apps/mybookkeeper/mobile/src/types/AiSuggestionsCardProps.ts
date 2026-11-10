import type { SuggestPlaceholdersResponse } from "@mybookkeeper/api-client/types/lease/suggest-placeholders-response";

export interface AiSuggestionsCardProps {
  suggestions: SuggestPlaceholdersResponse;
  /** Keys of the placeholders the template already has. */
  savedKeys: ReadonlySet<string>;
  onDismiss: () => void;
}
