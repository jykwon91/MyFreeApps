import type { SessionBlock } from "../types/session/session-block";
import type { UsageToday } from "../types/tutor/usage-today";

/** Up-front budget check, so a capped learner isn't asked to answer first. */
export function usageBlock(usage: UsageToday | undefined): SessionBlock | null {
  if (!usage) return null;
  if (!usage.tutor_available) return "unavailable";
  if (usage.cap_reached) return "daily_limit";
  return null;
}
