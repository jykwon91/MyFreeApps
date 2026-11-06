/**
 * Story field caps — MUST match `backend/app/core/wow_feature_request_limits.py` (the PATCH schema
 * rejects anything longer).
 */
export const TRIAGE_FIELD_MAX = {
  title: 80,
  persona: 120,
  i_want: 300,
  so_that: 300,
  topic: 30,
  feasibility_note: 300,
  operator_note: 1000,
  criterion: 200,
  follow_up: 200,
  shipped_path: 200,
} as const;

export const TRIAGE_CRITERIA_MAX_ITEMS = 6;
export const TRIAGE_FOLLOW_UPS_MAX_ITEMS = 4;

/** Submitting stops at this many untriaged submissions (backend MAX_UNTRIAGED_SUBMISSIONS). */
export const TRIAGE_INBOX_HARD_LIMIT = 500;
