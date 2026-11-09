import type { SuggestionStatus } from "./SuggestionStatus";

export interface UpdateSuggestionStatusParams {
  returnId: string;
  suggestionId: string;
  status: SuggestionStatus;
}
