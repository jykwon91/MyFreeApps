import type { SessionBlock } from "../types/session/session-block";
import type { UsageToday } from "../types/tutor/usage-today";

/** Up-front check, so a learner who can't be answered isn't asked to speak first. The
 *  conversation's own limit outranks the daily one: it never lifts, the daily one does. */
export function usageBlock(usage: UsageToday | undefined): SessionBlock | null {
  if (!usage) return null;
  if (!usage.tutor_available) return "unavailable";
  if (usage.session_limit_reached) return "session_limit";
  if (usage.cap_reached) return "daily_limit";
  return null;
}
