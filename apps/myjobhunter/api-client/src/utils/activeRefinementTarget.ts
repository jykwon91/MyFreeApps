import type { ImprovementTarget } from "../types/resume-refinement/improvement-target";
import type { RefinementSession } from "../types/resume-refinement/refinement-session";

/** The target the session is on, or null before the review has run or once every target is through. */
export function activeRefinementTarget(session: Pick<RefinementSession, "improvement_targets" | "target_index">): ImprovementTarget | null {
  const targets = session.improvement_targets;
  return targets && session.target_index < targets.length ? (targets[session.target_index] ?? null) : null;
}
