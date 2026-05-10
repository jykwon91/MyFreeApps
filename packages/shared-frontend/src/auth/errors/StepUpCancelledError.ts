/**
 * Thrown when the user dismisses the step-up auth modal (Cancel,
 * ESC, or backdrop click). RTK Query / axios callers can detect this
 * via `instanceof StepUpCancelledError` (or by inspecting `error.data
 * === "step_up_cancelled"` after passing through axiosBaseQuery) and
 * surface a "Cancelled" toast instead of a generic failure.
 */
export class StepUpCancelledError extends Error {
  readonly code = "step_up_cancelled" as const;
  readonly reason: "user_cancelled" | "tab_closed";

  constructor(reason: "user_cancelled" | "tab_closed" = "user_cancelled") {
    super(`Step-up cancelled (${reason})`);
    this.name = "StepUpCancelledError";
    this.reason = reason;
    Object.setPrototypeOf(this, StepUpCancelledError.prototype);
  }
}
