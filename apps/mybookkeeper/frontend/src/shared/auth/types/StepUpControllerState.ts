/**
 * Snapshot of the step-up controller — consumed by the React
 * `StepUpModal` via `useSyncExternalStore`. `pending` is non-null
 * exactly when the modal should be open.
 *
 * MBK fork — byte-identical to packages/shared-frontend/src/auth/
 * types/StepUpControllerState.ts.
 */
export interface StepUpControllerState {
  pending: { kind: "totp" } | null;
  attempt: number;
  errorMessage: string | null;
  submitting: boolean;
}
