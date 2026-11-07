import { extractErrorMessage } from "./errorMessage";

/**
 * Sign-in was refused because the email isn't verified yet. Login pages show
 * a "Resend verification email" button for it.
 */
export function isUnverifiedLoginError(err: unknown): boolean {
  return extractErrorMessage(err) === "LOGIN_USER_NOT_VERIFIED";
}
