/**
 * The flavor of step-up the backend emitted via the
 * `X-Require-Step-Up` response header.
 *
 *  - `"totp"`  — open the step-up modal to collect a fresh TOTP code.
 *  - `"reauth"` — JWT iat is past the recent-auth window; the user
 *                must log in again entirely (no modal).
 */
export type StepUpKind = "totp" | "reauth";
