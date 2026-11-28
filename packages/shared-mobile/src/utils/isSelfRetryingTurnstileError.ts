import { TURNSTILE_SELF_RETRYING_ERROR_CODES, TURNSTILE_SELF_RETRYING_ERROR_PREFIXES } from "../constants/turnstile";

/** Whether the widget gets past this error code on its own, so the person can still pass the check. */
export function isSelfRetryingTurnstileError(code: string): boolean {
  return (
    TURNSTILE_SELF_RETRYING_ERROR_CODES.includes(code) ||
    (/^\d{6}$/.test(code) && TURNSTILE_SELF_RETRYING_ERROR_PREFIXES.some((prefix) => code.startsWith(prefix)))
  );
}
