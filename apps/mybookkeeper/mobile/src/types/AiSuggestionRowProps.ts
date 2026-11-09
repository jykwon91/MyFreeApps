import type { SuggestedPlaceholderItem } from "@mybookkeeper/api-client/types/lease/suggested-placeholder-item";

export interface AiSuggestionRowProps {
  item: SuggestedPlaceholderItem;
  typeLabel: string;
  /** The template has no placeholder for it yet. */
  isNew: boolean;
}
