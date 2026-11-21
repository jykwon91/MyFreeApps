import type { RefinementSession } from "../types/resume-refinement/refinement-session";

/**
 * Whether a fetched session is from before the one already shown: a reload that left before an answer landed and
 * came back after it. `turn_count` only goes up, so a lower one is older, and putting it on screen would bring an
 * answered suggestion back with its buttons live.
 */
export function isOlderSessionReply(fetched: Pick<RefinementSession, "turn_count">, shown: Pick<RefinementSession, "turn_count">): boolean {
  return fetched.turn_count < shown.turn_count;
}
