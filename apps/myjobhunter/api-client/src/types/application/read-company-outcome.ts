import type { ReviewCompanyState } from "./review-company-state";

/**
 * The company a read posting names, once matched against the tracked companies.
 *
 * - stale:    the read was abandoned (the dialog closed, the screen went) while this ran; do nothing.
 * - resolved: tracked, new (to be added on Save), or nothing named.
 * - failed:   saving adds it by name. `reason` says why it couldn't be matched: the companies didn't load
 *             ("listUnavailable"), or its name is longer than a company may be called ("nameTooLong").
 */
export type ReadCompanyOutcome =
  | { kind: "stale" }
  | { kind: "resolved"; company: ReviewCompanyState }
  | {
      kind: "failed";
      reason: "listUnavailable" | "nameTooLong";
      company: Extract<ReviewCompanyState, { kind: "autoCreateFailed" }>;
      error: unknown;
    };
