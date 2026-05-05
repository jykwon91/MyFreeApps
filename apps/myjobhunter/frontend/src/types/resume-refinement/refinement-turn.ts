export type RefinementTurnRole =
  | "ai_critique"
  | "ai_proposal"
  | "user_accept"
  | "user_custom"
  | "user_request_alternative"
  | "user_skip"
  | "session_complete";

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
