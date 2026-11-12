import type { RefinementTurn } from "../types/resume-refinement/refinement-turn";

/** What a transcript bubble says for a turn, or null for a turn the transcript doesn't show. */
export function refinementTurnBody(turn: RefinementTurn): string | null {
  switch (turn.role) {
    case "ai_critique":
      return turn.rationale ?? "Initial review complete.";
    case "ai_proposal":
      if (turn.clarifying_question) return turn.clarifying_question;
      if (turn.proposed_text) return turn.proposed_text;
      return null;
    case "user_accept":
      return turn.proposed_text ? `Accepted: ${turn.proposed_text}` : "Accepted this suggestion.";
    case "user_accept_flagged":
      return turn.proposed_text
        ? `Accepted (confirmed accurate): ${turn.proposed_text}`
        : "Accepted this suggestion after confirming the details.";
    case "user_custom":
      return turn.user_text ?? "Submitted a custom rewrite.";
    case "user_request_alternative":
      // The user's own words, as plain chat text: a "Try something with: …" prefix mislabeled
      // clarify answers as reroll hints (operator complaint, 2026-07-02).
      return turn.user_text ?? "Asked for another take.";
    case "user_created_target":
      return turn.user_text ? `Picked from the draft: ${turn.user_text}` : "Picked a line from the draft.";
    case "user_skip":
      return "Skipped.";
    case "session_complete":
      return null;
    default:
      return null;
  }
}
