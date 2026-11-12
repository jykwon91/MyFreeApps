import type { SessionBlock } from "../types/session/session-block";

/** Backend refusal codes (HTTP ``detail``) that block further turns. */
export const BLOCKING_CODES: Readonly<Record<string, SessionBlock>> = {
  daily_limit_reached: "daily_limit",
  tutor_unavailable: "unavailable",
  session_turn_limit: "session_limit",
  session_ended: "session_ended",
};

/** What any 429 that isn't one of the codes below is normalised to. */
export const RATE_LIMITED = "rate_limited";

/** 429 refusals that carry one of our own codes, not the burst limiter's prose. */
export const KNOWN_429_CODES: ReadonlySet<string> = new Set(["daily_limit_reached", "turn_in_progress"]);
