import { isAxiosError } from "axios";
import { AUTH_ERROR_FALLBACK } from "../constants/auth-error-fallback";
import { AUTH_ERROR_MESSAGES } from "../constants/auth-error-messages";
import { extractErrorMessage } from "./errorMessage";

/**
 * `extractErrorMessage`, with known auth codes turned into readable copy. An
 * axios failure the server gave no reason for (network error, empty 502)
 * would otherwise show axios's own text ("Request failed with status code
 * 502"), so it gets a plain fallback instead.
 */
export function describeAuthError(err: unknown): string {
  const message = extractErrorMessage(err);
  if (isAxiosError(err) && message === err.message) return AUTH_ERROR_FALLBACK;
  return AUTH_ERROR_MESSAGES.get(message) ?? message;
}
