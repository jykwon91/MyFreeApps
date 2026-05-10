/**
 * Thrown when the backend's strict gate emits
 * `X-Require-Step-Up: reauth` — the user's session JWT has aged past
 * the recent-auth window (60 min by default) and a fresh login is
 * required. This is distinct from `step_up_cancelled` (user opted
 * out) and from a generic 401 (unauthenticated): the caller's normal
 * recovery is to clear the token and redirect to /login.
 *
 * MBK fork — byte-identical to packages/shared-frontend/src/auth/
 * errors/StepUpReauthRequiredError.ts.
 */
export class StepUpReauthRequiredError extends Error {
  readonly code = "step_up_reauth_required" as const;

  constructor(message = "Re-authenticate (session too old for this action)") {
    super(message);
    this.name = "StepUpReauthRequiredError";
    Object.setPrototypeOf(this, StepUpReauthRequiredError.prototype);
  }
}
