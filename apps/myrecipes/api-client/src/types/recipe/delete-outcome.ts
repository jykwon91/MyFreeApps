/** How a delete that didn't succeed turned out: the thing is gone anyway, or it's still there. */
export interface DeleteFailureOutcome {
  /** True when the server said it was already gone (404): treat it as deleted and refresh. */
  isGone: boolean;
  /** What to tell the user. */
  message: string;
}
