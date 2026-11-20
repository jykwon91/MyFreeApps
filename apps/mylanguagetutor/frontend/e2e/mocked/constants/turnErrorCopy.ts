/**
 * What the practice screen says when a turn fails and can be tried again,
 * written out (not imported from the app's copy) so a spec fails when the words
 * a learner sees change.
 */
export const SESSION_CREATE_FAILED_COPY = "Couldn't start the conversation. Try again.";
export const TUTOR_BUSY_COPY = "The tutor is busy right now. Give it a moment and try again.";
export const TUTOR_INPUT_REJECTED_COPY = "The tutor couldn't respond to that. Try saying it a different way.";
export const RATE_LIMITED_COPY = "That was a lot of messages in a short time. Wait a few seconds and try again.";
export const TURN_IN_PROGRESS_COPY = "Your last message is still being answered. Try again in a moment.";
export const SESSION_NOT_FOUND_COPY = "This conversation is no longer available. Try again to start a new one.";
export const CONNECTION_LOST_COPY = "The connection dropped before the tutor finished. Try again.";
/** A turn the daily limit refused: its words stay on screen to send again later. */
export const DAILY_LIMIT_KEPT_COPY =
  "That answer wasn't sent because today's practice time ran out. It's kept above, so you can send it again once your practice time is back.";
