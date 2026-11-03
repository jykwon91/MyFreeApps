/**
 * Snapshot of the step-up controller — consumed by the React
 * `StepUpModal` via `useSyncExternalStore`. `pending` is non-null
 * exactly when the modal should be open.
 */
export interface StepUpControllerState {
  pending: { kind: "totp" } | null;
  /** Increments on every wrong-code submit so the modal can clear the input. */
  attempt: number;
  /** Last error message to render under the input, or null. */
  errorMessage: string | null;
  /** True while the controller's `submit` is awaiting the retry response. */
  submitting: boolean;
}
