import type { ConversationItem } from "../types/resume-refinement/conversation-item";
import type { RefinementTurn } from "../types/resume-refinement/refinement-turn";
import { refinementTurnBody } from "./refinementTurnBody";

/** The transcript's rows: every turn it shows, with a divider before each change of section. */
export function conversationItems(turns: readonly RefinementTurn[]): ConversationItem[] {
  const out: ConversationItem[] = [];
  let lastSection: string | null = null;
  for (const turn of turns) {
    if (turn.role === "session_complete") continue;
    if (refinementTurnBody(turn) === null) continue;
    if (turn.target_section && turn.target_section !== lastSection) {
      out.push({ kind: "divider", section: turn.target_section });
      lastSection = turn.target_section;
    }
    out.push({ kind: "turn", turn });
  }
  return out;
}
