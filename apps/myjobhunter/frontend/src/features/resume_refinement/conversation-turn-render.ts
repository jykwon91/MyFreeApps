import type { RefinementTurn } from "@/types/resume-refinement/refinement-turn";

/**
 * Pure render helpers for the conversation transcript. Shared by
 * ConversationHistory (list building) and ConversationBubble (body
 * text) so each component file owns exactly one component.
 */

export type ConversationItem =
  | { kind: "divider"; section: string }
  | { kind: "turn"; turn: RefinementTurn };

export function isUserRole(role: RefinementTurn["role"]): boolean {
  return (
    role === "user_accept" ||
    role === "user_accept_flagged" ||
    role === "user_custom" ||
    role === "user_request_alternative" ||
    role === "user_skip"
  );
}

export function buildItems(turns: RefinementTurn[]): ConversationItem[] {
  const out: ConversationItem[] = [];
  let lastSection: string | null = null;
  for (const turn of turns) {
    if (turn.role === "session_complete") continue;
    if (renderTurnBody(turn) === null) continue;
    if (turn.target_section && turn.target_section !== lastSection) {
      out.push({ kind: "divider", section: turn.target_section });
      lastSection = turn.target_section;
    }
    out.push({ kind: "turn", turn });
  }
  return out;
}

export function renderTurnBody(turn: RefinementTurn): string | null {
  switch (turn.role) {
    case "ai_critique":
      return turn.rationale ?? "Initial review complete.";
    case "ai_proposal":
      if (turn.clarifying_question) return turn.clarifying_question;
      if (turn.proposed_text) return turn.proposed_text;
      return null;
    case "user_accept":
      return turn.proposed_text
        ? `Accepted: ${turn.proposed_text}`
        : "Accepted this suggestion.";
    case "user_accept_flagged":
      return turn.proposed_text
        ? `Accepted (confirmed accurate): ${turn.proposed_text}`
        : "Accepted this suggestion after confirming the details.";
    case "user_custom":
      return turn.user_text ?? "Submitted a custom rewrite.";
    case "user_request_alternative":
      // The user's own words, rendered as plain chat text — the old
      // "Try something with: …" prefix mislabeled clarify answers as
      // reroll hints (operator complaint, 2026-07-02).
      return turn.user_text ?? "Asked for another take.";
    case "user_skip":
      return "Skipped.";
    case "session_complete":
      return null;
    default:
      return null;
  }
}
