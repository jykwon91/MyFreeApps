import type { ScreeningStatus } from "../types/applicant/screening-status";

/**
 * Canonical screening result status values.
 *
 * Mirrors the backend ``SCREENING_STATUSES`` tuple in
 * ``app/core/applicant_enums.py`` — keep both in sync when adding values.
 *
 * Outcome semantics (per PR 3.3 KeyCheck redirect-only flow):
 *   pending       — host requested but hasn't uploaded a report yet
 *   pass          — host approves; no adverse action needed
 *   fail          — host declines; adverse_action_snippet is required
 *   inconclusive  — provider couldn't render a clear verdict; the host
 *                   may still take adverse action so a snippet is required
 */
export const SCREENING_STATUSES = [
  "pending",
  "pass",
  "fail",
  "inconclusive",
] as const satisfies readonly ScreeningStatus[];

/** "pending" is for a report that hasn't come back, so it isn't an outcome you can upload. */
export const SCREENING_UPLOAD_OUTCOMES: readonly ScreeningStatus[] = ["pass", "fail", "inconclusive"];

/** Statuses that REQUIRE an ``adverse_action_snippet`` on upload. */
export const ADVERSE_OUTCOMES: readonly ScreeningStatus[] = ["fail", "inconclusive"] as const;

export const SCREENING_STATUS_LABELS: Record<ScreeningStatus, string> = {
  pending: "Pending",
  pass: "Passed",
  fail: "Failed",
  inconclusive: "Inconclusive",
};
