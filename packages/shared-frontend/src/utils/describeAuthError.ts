import { AUTH_ERROR_MESSAGES } from "../constants/auth-error-messages";
import { extractErrorMessage } from "./errorMessage";

/** `extractErrorMessage`, with known fastapi-users codes turned into readable copy. */
export function describeAuthError(err: unknown): string {
  const message = extractErrorMessage(err);
  return AUTH_ERROR_MESSAGES.get(message) ?? message;
}
