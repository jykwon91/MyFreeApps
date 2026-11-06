import type { DelayedActionPhase } from "@/games/wow-forever/types/featureRequests/triage/delayedActionPhase";

export interface PendingDelayedAction {
  id: string;
  label: string;
  phase: DelayedActionPhase;
}
