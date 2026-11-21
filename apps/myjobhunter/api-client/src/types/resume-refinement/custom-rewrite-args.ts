import type { RefinementAnswerArgs } from "./refinement-answer-args";

/** Write my own: the user's text for the suggestion on screen. */
export interface CustomRewriteArgs extends RefinementAnswerArgs {
  user_text: string;
}
