import type { TriageLockReason } from "@/games/wow-forever/types/featureRequests/triage/triageLockReason";

/** What the screen renders from the in-memory key store. Never carries the key itself. */
export interface TriageKeySnapshot {
  unlocked: boolean;
  /** Null before the first lock (a fresh page). */
  lockReason: TriageLockReason | null;
}
