import type { ImprovementTarget } from "../../types/resume-refinement/improvement-target";
import type { RefinementSession } from "../../types/resume-refinement/refinement-session";
import type { RefinementTurn } from "../../types/resume-refinement/refinement-turn";

/** A critique-chosen target in the Experience section. */
export function improvementTarget(overrides: Partial<ImprovementTarget> = {}): ImprovementTarget {
  return {
    section: "Experience",
    current_text: "Built APIs",
    improvement_type: "add_metric",
    severity: "high",
    notes: null,
    origin: "ai",
    ...overrides,
  };
}

/** A transcript row, an AI proposal unless told otherwise. */
export function refinementTurn(overrides: Partial<RefinementTurn> = {}): RefinementTurn {
  return {
    id: "t1",
    turn_index: 0,
    role: "ai_proposal",
    target_section: null,
    proposed_text: null,
    user_text: null,
    rationale: null,
    clarifying_question: null,
    created_at: "2026-11-10T00:00:00Z",
    ...overrides,
  };
}

/** An active session on its first of two targets, as GET /resume-refinement/sessions/:id returns it. */
export function refinementSession(overrides: Partial<RefinementSession> = {}): RefinementSession {
  return {
    id: "s1",
    source_resume_job_id: "j1",
    status: "active",
    current_draft: "# Ada\n\n## Experience\n- Built APIs\n",
    improvement_targets: [improvementTarget(), improvementTarget({ current_text: "Led a team", severity: "low" })],
    target_index: 0,
    pending_target_section: "Experience",
    pending_proposal: "Built 12 APIs serving 3M requests a day",
    pending_rationale: "Numbers show scale.",
    pending_clarifying_question: null,
    pending_guard_flagged: null,
    guard_can_force: false,
    turn_count: 2,
    total_tokens_in: 0,
    total_tokens_out: 0,
    total_cost_usd: "0",
    error_message: null,
    proposals_ready_count: 2,
    completed_at: null,
    created_at: "2026-11-10T00:00:00Z",
    updated_at: "2026-11-10T00:00:00Z",
    turns: [],
    ...overrides,
  };
}
