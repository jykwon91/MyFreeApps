/**
 * What the practice and scenario screens say when the learner can't send a
 * turn, written out (not imported from the app's copy) so a spec fails when the
 * words a learner sees change.
 */
/** The quota resets at 00:00 UTC: 6:00 PM in Chicago in winter. */
export const LEARNER_TIME_ZONE = "America/Chicago";
/** 9:00 AM in Chicago, before that day's reset. */
export const BEFORE_RESET = new Date("2026-01-15T15:00:00Z");
/** 7:00 PM in Chicago: that day's reset has passed, so the next one is tomorrow. */
export const AFTER_RESET = new Date("2026-01-16T01:00:00Z");
export const DAILY_LIMIT_COPY = "You've used today's practice time. It resets today at 6:00 PM.";
export const DAILY_LIMIT_AFTER_RESET_COPY = "You've used today's practice time. It resets tomorrow at 6:00 PM.";
export const UNAVAILABLE_COPY = "The tutor is taking a break right now. Please check back later.";
export const SESSION_ENDED_COPY = "This conversation has ended. Start a new one to keep going.";
export const SESSION_LIMIT_COPY = "This conversation has reached its length limit. Start a new one to keep going.";
