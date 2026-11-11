import type { ReviewCompanyState } from "./review-company-state";

/**
 * The company a read posting names, once matched against the tracked companies.
 *
 * - stale:    the read was abandoned (the dialog closed, the screen went) while this ran; do nothing.
 * - resolved: tracked, just added, or nothing named.
 * - failed:   saving retries the add. `reason` says which step failed: the companies didn't load
 *             ("listUnavailable"), adding this one did ("addFailed"), or its name is longer than a company
 *             may be called, so no request was sent ("nameTooLong").
 */
export type ReadCompanyOutcome =
  | { kind: "stale" }
  | { kind: "resolved"; company: ReviewCompanyState }
  | {
      kind: "failed";
      reason: "listUnavailable" | "addFailed" | "nameTooLong";
      company: Extract<ReviewCompanyState, { kind: "autoCreateFailed" }>;
      error: unknown;
    };
