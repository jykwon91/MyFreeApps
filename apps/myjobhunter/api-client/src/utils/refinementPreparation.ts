import { IMPROVEMENT_SEVERITY_ORDER } from "../constants/improvementSeverityOrder";
import type { RefinementPreparation } from "../types/resume-refinement/refinement-preparation";
import type { RefinementSession } from "../types/resume-refinement/refinement-session";

/**
 * The preparation's stage, worked out only from what the session keeps (status, targets, how many
 * proposals are ready), so a refresh or a return to the screen shows it right from the next poll.
 * Severities with no targets are left out, most serious first.
 */
export function refinementPreparation(
  session: Pick<RefinementSession, "status" | "improvement_targets" | "proposals_ready_count">,
): RefinementPreparation {
  if (session.status === "failed") return { stage: "failed" };
  const targets = session.improvement_targets;
  if (targets === null) return { stage: "critiquing" };
  const severities = IMPROVEMENT_SEVERITY_ORDER.map((severity) => ({
    severity,
    count: targets.filter((target) => target.severity === severity).length,
  })).filter(({ count }) => count > 0);
  return { stage: "drafting", total: targets.length, ready: Math.min(session.proposals_ready_count, targets.length), severities };
}
