import type { DelayedAction } from "@/games/wow-forever/types/featureRequests/triage/delayedAction";
import type { PendingDelayedAction } from "@/games/wow-forever/types/featureRequests/triage/pendingDelayedAction";

export interface DelayedActionsState {
  pending: readonly PendingDelayedAction[];
  /** Epoch ms until which the server asked us to wait (429), or null. */
  rateLimitedUntil: number | null;
  schedule: (action: DelayedAction) => void;
  undo: (id: string) => boolean;
  flush: (id?: string) => Promise<void>;
}
