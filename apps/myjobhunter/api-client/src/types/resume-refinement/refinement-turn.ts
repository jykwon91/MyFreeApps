import type { RefinementTurnRole } from "./refinement-turn-role";

export interface RefinementTurn {
  id: string;
  turn_index: number;
  role: RefinementTurnRole;
  target_section: string | null;
  proposed_text: string | null;
  user_text: string | null;
  rationale: string | null;
  clarifying_question: string | null;
  created_at: string;
}
