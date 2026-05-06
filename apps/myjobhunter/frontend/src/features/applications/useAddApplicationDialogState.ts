/**
 * State machine for the redesigned AddApplicationDialog.
 *
 * Three top-level steps:
 *   1. input       — the dialog opens here. Operator pastes a URL,
 *                    pastes JD text, or types a company name to do
 *                    a fully manual entry.
 *   2. processing  — the JD extract / parse mutation is in flight.
 *   3. review      — the form is pre-filled (or empty for the manual
 *                    path); operator confirms / edits and submits.
 *
 * The shape is deliberately flat: no nested status fields, no
 * "previousMode". When a transition happens, the caller replaces the
 * whole state; the discriminated union forces TS to enforce that
 * mutually-exclusive fields can't co-exist.
 *
 * Operator-facing copy
 * ====================
 * - inputMode "url"          : URL paste is the primary path
 * - inputMode "text"         : JD-text paste fallback (mostly LinkedIn / auth-walled)
 * - inputMode "company-name" : fully manual entry — operator types the company name
 *
 * Why no separate "expanded/collapsed" state
 * ==========================================
 * Per the redesign spec, the dialog opens directly into the URL input.
 * There's no collapsed prompt anymore — the input IS the dialog at
 * step 1.
 */

export type DialogInputMode = "url" | "text" | "company-name";

/**
 * Confirmation pill state during the review step.
 *
 * - tracked:           AI extracted a company name that already exists
 *                      in the operator's list — we just selected it.
 * - new:               AI extracted a name and we created it on the fly.
 * - autoCreateFailed:  AI extracted a name but createCompany rejected.
 *                      The submit-time fallback in the parent is what
 *                      eventually saves the application.
 * - manual:            Operator went through the company-name path and
 *                      typed a company themselves. companyId may be
 *                      empty if the create hasn't happened yet.
 */
export type ReviewCompanyState =
  | { kind: "tracked"; companyId: string; name: string; logoUrl: string | null }
  | { kind: "new"; companyId: string; name: string; logoUrl: string | null }
  | { kind: "autoCreateFailed"; name: string }
  | { kind: "manual"; companyId: string | null; name: string; logoUrl: string | null };

export type DialogState =
  | { kind: "input"; inputMode: DialogInputMode }
  | { kind: "processing"; sourcePath: "url" | "text"; longRunning: boolean }
  | {
      kind: "review";
      sourceUrl: string | null;
      summary: string | null;
      company: ReviewCompanyState;
      /** True while the company combobox replaces the pill. */
      changingCompany: boolean;
    };

export const INITIAL_STATE: DialogState = { kind: "input", inputMode: "url" };

/**
 * Threshold (ms) after which the processing step swaps the spinner
 * sub-text from "Reading job posting…" to "This is taking longer than
 * usual…". 3 seconds was chosen by the design review.
 */
export const PROCESSING_LONG_RUNNING_THRESHOLD_MS = 3000;
