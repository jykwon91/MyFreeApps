import type { DelayedAction } from "@/games/wow-forever/types/featureRequests/triage/delayedAction";

export interface DelayedActionFailure {
  action: DelayedAction;
  error: unknown;
  /** The flush ran because the page was being hidden or closed. */
  onPageHide: boolean;
}
