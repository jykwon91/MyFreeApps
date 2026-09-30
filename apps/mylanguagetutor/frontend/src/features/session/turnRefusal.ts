import type { SessionBlock } from "@/types/session/session-block";

/** Backend refusal codes (HTTP ``detail``) that block further turns. */
const BLOCKING_CODES: Record<string, SessionBlock> = {
  daily_limit_reached: "daily_limit",
  tutor_unavailable: "unavailable",
  session_turn_limit: "session_limit",
  session_ended: "session_ended",
};

export function blockForCode(code: string): SessionBlock | null {
  return BLOCKING_CODES[code] ?? null;
}

/** Refusals worth offering "Try again" for (transient). */
export function isRetryableRefusal(status: number, code: string): boolean {
  if (code === "turn_in_progress" || code === "network_error") return true;
  return status === 0 || status >= 500 || status === 429;
}

const RATE_LIMITED = "rate_limited";
const KNOWN_429_CODES = new Set(["daily_limit_reached", "turn_in_progress"]);

/**
 * The refusal's machine code. The burst limiter answers 429 with shared
 * prose ("Too many attempts") rather than a code, so any 429 that isn't one
 * of ours is normalised to ``rate_limited``.
 */
export function normaliseRefusalCode(status: number, detail: string): string {
  if (status === 429 && !KNOWN_429_CODES.has(detail)) return RATE_LIMITED;
  return detail;
}
