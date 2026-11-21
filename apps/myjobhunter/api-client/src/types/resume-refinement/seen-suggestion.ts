/**
 * The suggestion on screen when the user answered it: the session's `target_index` and `turn_count` as the client
 * last had them. The server refuses an accept, accept-anyway, write-my-own, reply, another take or skip whose
 * suggestion has since moved on, so a tap a step behind the screen never acts on one the user didn't see.
 */
export interface SeenSuggestion {
  seen_target_index: number;
  seen_turn_count: number;
}
