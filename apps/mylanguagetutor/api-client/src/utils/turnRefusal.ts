import { NETWORK_ERROR, SESSION_NOT_FOUND } from "../constants/turnFailureCodes";
import { BLOCKING_CODES, KNOWN_429_CODES, RATE_LIMITED } from "../constants/turnRefusal";
import type { SessionBlock } from "../types/session/session-block";

export function blockForCode(code: string): SessionBlock | null {
  return BLOCKING_CODES[code] ?? null;
}

/** Refusals worth offering "Try again" for: transient ones, and a lost session, which a retry replaces. */
export function isRetryableRefusal(status: number, code: string): boolean {
  if (code === "turn_in_progress" || code === NETWORK_ERROR || code === SESSION_NOT_FOUND) return true;
  return status === 0 || status >= 500 || status === 429;
}

/**
 * The refusal's machine code. The burst limiter answers 429 with shared
 * prose ("Too many attempts") rather than a code, so any 429 that isn't one
 * of ours is normalised to ``rate_limited``.
 */
export function normaliseRefusalCode(status: number, detail: string): string {
  if (status === 429 && !KNOWN_429_CODES.has(detail)) return RATE_LIMITED;
  return detail;
}
