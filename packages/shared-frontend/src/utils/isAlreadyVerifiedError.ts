import { extractErrorMessage } from "./errorMessage";

/**
 * POST /auth/verify answered "already verified" — usually a second click on
 * the email link. Verify pages treat it as success, not a failure.
 */
export function isAlreadyVerifiedError(err: unknown): boolean {
  return extractErrorMessage(err) === "VERIFY_USER_ALREADY_VERIFIED";
}
