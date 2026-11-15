import type { SessionBlock } from "../types/session/session-block";

/**
 * Why the learner can't send another turn, as the website and the phone say it.
 * The daily limit is worded by ``sessionBlockMessage`` (it names the reset time).
 */
export const SESSION_BLOCK_COPY: Record<Exclude<SessionBlock, "daily_limit">, string> = {
  unavailable: "The tutor is taking a break right now. Please check back later.",
  session_limit: "This conversation has reached its length limit. Start a new one to keep going.",
  session_ended: "This conversation has ended. Start a new one to keep going.",
};

/** Whether picking another scenario gets the learner going again. */
export const SESSION_BLOCK_CAN_START_NEW: Record<SessionBlock, boolean> = {
  daily_limit: false,
  unavailable: false,
  session_limit: true,
  session_ended: true,
};
