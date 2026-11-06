import type { DelayedAction } from "@/games/wow-forever/types/featureRequests/triage/delayedAction";
import type { DelayedActionFailure } from "@/games/wow-forever/types/featureRequests/triage/delayedActionFailure";

export interface DelayedActionOptions {
  delayMs: number;
  onSuccess: (action: DelayedAction) => void;
  onFailure: (failure: DelayedActionFailure) => void;
}
