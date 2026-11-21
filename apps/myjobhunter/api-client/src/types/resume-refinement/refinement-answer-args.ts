import type { SeenSuggestion } from "./seen-suggestion";

/** An answer to the suggestion on screen (accept, accept anyway, skip, ...): the session and which suggestion it was. */
export interface RefinementAnswerArgs extends SeenSuggestion {
  id: string;
}
