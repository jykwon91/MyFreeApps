import { makeTarget } from "./makeTarget";
import type { RefinementSession } from "@myjobhunter/api-client/types/resume-refinement/refinement-session";

export function makeRefinementSession(overrides: Partial<RefinementSession> = {}): RefinementSession {
  return {
    id: "session-1",
    source_resume_job_id: null,
    status: "active",
    current_draft: "- Led the team\n- Shipped the app",
    improvement_targets: [makeTarget("Led the team"), makeTarget("Shipped the app")],
    target_index: 0,
    pending_target_section: "Experience",
    pending_proposal: "Led a team of 5",
    pending_rationale: "Adds scope",
    pending_clarifying_question: null,
    pending_guard_flagged: null,
    guard_can_force: false,
    turn_count: 2,
    total_tokens_in: 0,
    total_tokens_out: 0,
    total_cost_usd: "0",
    error_message: null,
    proposals_ready_count: 0,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    turns: [],
    ...overrides,
  };
}
