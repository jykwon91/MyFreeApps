import type { ImprovementTarget } from "./improvement-target";
import type { RefinementTurn } from "./refinement-turn";

export type RefinementSessionStatus =
  | "preparing"
  | "active"
  | "completed"
  | "abandoned"
  | "failed";

export interface RefinementSession {
  id: string;
  source_resume_job_id: string | null;
  status: RefinementSessionStatus;
  current_draft: string;
  improvement_targets: ImprovementTarget[] | null;
  target_index: number;
  pending_target_section: string | null;
  pending_proposal: string | null;
  pending_rationale: string | null;
  pending_clarifying_question: string | null;
  pending_guard_flagged: string[] | null;
  guard_can_force: boolean;
  turn_count: number;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: string;
  error_message: string | null;
  proposals_ready_count: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  turns: RefinementTurn[];
}
