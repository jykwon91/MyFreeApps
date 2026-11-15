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

/** The daily-limit notice; ``when`` is e.g. "today at 6:00 PM". */
export function dailyLimitCopy(when: string): string {
  return `You've used today's practice time. It resets ${when}.`;
}

/** The day word in the reset time, relative to the learner's own date. */
export const RESET_DAY_COPY = { today: "today", tomorrow: "tomorrow" } as const;

/** Whether picking another scenario gets the learner going again. */
export const SESSION_BLOCK_CAN_START_NEW: Record<SessionBlock, boolean> = {
  daily_limit: false,
  unavailable: false,
  session_limit: true,
  session_ended: true,
};
