import type { SubmitProblemKind } from "@/games/wow-forever/types/featureRequests/submitProblemKind";

/** A submit that failed, as the form shows it. */
export interface SubmitFailure {
  kind: SubmitProblemKind;
  /** Seconds until the per-address limit lifts (429 Retry-After); null when the server didn't say. */
  retryAfterSeconds: number | null;
}
