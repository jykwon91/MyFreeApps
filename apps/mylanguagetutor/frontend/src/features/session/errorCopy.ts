/**
 * Learner-facing copy for turn failures. Keys are backend refusal ``detail``
 * codes and stream ``error`` codes; anything unknown gets the generic line.
 * Plain, blame-free wording -- the learner did nothing wrong.
 */
const TURN_ERROR_COPY: Record<string, string> = {
  tutor_busy: "The tutor is busy right now. Give it a moment and try again.",
  tutor_misconfigured: "The tutor isn't set up correctly. We've been notified.",
  tutor_input_rejected: "The tutor couldn't respond to that. Try saying it a different way.",
  turn_in_progress: "Your last message is still being answered. Try again in a moment.",
  rate_limited: "That was a lot of messages in a short time. Wait a few seconds and try again.",
  network_error: "Couldn't reach the tutor. Check your connection and try again.",
  connection_lost: "The connection dropped before the tutor finished. Try again.",
  session_create_failed: "Couldn't start the conversation. Try again.",
  session_not_found: "This conversation is no longer available. Try again to start a new one.",
};

const GENERIC_COPY = "Something went wrong. Try again.";

export function turnErrorCopy(code: string): string {
  return TURN_ERROR_COPY[code] ?? GENERIC_COPY;
}
