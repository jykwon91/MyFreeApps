import type { RefinementAnswerArgs } from "./refinement-answer-args";

/** Another take, or a reply to the assistant, for the suggestion on screen: an optional hint for the rewrite. */
export interface AlternativeRequestArgs extends RefinementAnswerArgs {
  hint?: string;
}
