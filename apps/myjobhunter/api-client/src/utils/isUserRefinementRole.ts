import type { RefinementTurnRole } from "../types/resume-refinement/refinement-turn-role";

/** Whether a turn is the user's (drawn on the user's side of the transcript) rather than the assistant's. */
export function isUserRefinementRole(role: RefinementTurnRole): boolean {
  return (
    role === "user_accept" ||
    role === "user_accept_flagged" ||
    role === "user_custom" ||
    role === "user_request_alternative" ||
    role === "user_created_target" ||
    role === "user_skip"
  );
}
