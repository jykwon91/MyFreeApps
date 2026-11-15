/**
 * What the practice and scenario screens say when the learner can't send a
 * turn, written out (not imported from the app's copy) so a spec fails when the
 * words a learner sees change.
 */
/** The quota resets at 00:00 UTC: 6:00 PM in Chicago in winter, 7:00 PM in summer. */
export const LEARNER_TIME_ZONE = "America/Chicago";
export const DAILY_LIMIT_COPY = /You've used today's practice time\. It resets today at [67]:00 PM\./;
export const UNAVAILABLE_COPY = "The tutor is taking a break right now. Please check back later.";
export const SESSION_ENDED_COPY = "This conversation has ended. Start a new one to keep going.";
export const SESSION_LIMIT_COPY = "This conversation has reached its length limit. Start a new one to keep going.";
