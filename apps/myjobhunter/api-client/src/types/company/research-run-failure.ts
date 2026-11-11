import type { ResearchRunFailureReason } from "./research-run-failure-reason";

/** A failed POST /companies/{id}/research, as a screen needs it. */
export interface ResearchRunFailure {
  reason: ResearchRunFailureReason;
  /** The server's `detail` line, when it sent one. */
  detail: string | null;
}
