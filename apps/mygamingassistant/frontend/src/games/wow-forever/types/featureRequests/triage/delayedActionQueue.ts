import type { DelayedAction } from "@/games/wow-forever/types/featureRequests/triage/delayedAction";
import type { DelayedActionHandlers } from "@/games/wow-forever/types/featureRequests/triage/delayedActionHandlers";
import type { PendingDelayedAction } from "@/games/wow-forever/types/featureRequests/triage/pendingDelayedAction";

export interface DelayedActionQueue {
  schedule: (action: DelayedAction) => void;
  /** Cancel before the network call. False when it's already being sent (or unknown). */
  undo: (id: string) => boolean;
  /** Send every waiting action now (or just `id`), one after another. */
  flush: (id?: string, onPageHide?: boolean) => Promise<void>;
  pending: () => PendingDelayedAction[];
  setHandlers: (handlers: DelayedActionHandlers) => void;
}
