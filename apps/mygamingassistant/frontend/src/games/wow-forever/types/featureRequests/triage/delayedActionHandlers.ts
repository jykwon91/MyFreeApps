import type { DelayedAction } from "@/games/wow-forever/types/featureRequests/triage/delayedAction";
import type { DelayedActionFailure } from "@/games/wow-forever/types/featureRequests/triage/delayedActionFailure";
import type { PendingDelayedAction } from "@/games/wow-forever/types/featureRequests/triage/pendingDelayedAction";

export interface DelayedActionHandlers {
  onChange: (pending: PendingDelayedAction[]) => void;
  onSuccess: (action: DelayedAction) => void;
  onFailure: (failure: DelayedActionFailure) => void;
  /** The server asked us to wait until this epoch ms (429). Null once the wait is over. */
  onRateLimited: (untilMs: number | null) => void;
}
