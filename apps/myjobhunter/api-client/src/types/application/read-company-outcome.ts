import type { ReviewCompanyState } from "./review-company-state";

/**
 * The company a read posting names, once matched against the tracked companies.
 *
 * - stale:    the read was abandoned (the dialog closed, the screen went) while this ran; do nothing.
 * - resolved: tracked, just added, or nothing named.
 * - failed:   saving retries the add. `reason` says which step failed: the companies didn't load
 *             ("listUnavailable"), or adding this one did ("addFailed").
 */
export type ReadCompanyOutcome =
  | { kind: "stale" }
  | { kind: "resolved"; company: ReviewCompanyState }
  | {
      kind: "failed";
      reason: "listUnavailable" | "addFailed";
      company: Extract<ReviewCompanyState, { kind: "autoCreateFailed" }>;
      error: unknown;
    };
