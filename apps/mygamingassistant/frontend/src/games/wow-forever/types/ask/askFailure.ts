import type { AskFailureKind } from "@/games/wow-forever/types/ask/askFailureKind";

/** Why the last question didn't get an answer, and how long to wait when the server said. */
export interface AskFailure {
  kind: AskFailureKind;
  retryAfterSeconds: number | null;
  /** When it happened (keys the notice, so a repeat failure restarts its countdown). */
  at: number;
}
