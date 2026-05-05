import type { ImprovementTarget } from "./improvement-target";

export type RefinementSessionStatus = "active" | "completed" | "abandoned";

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
  turn_count: number;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
