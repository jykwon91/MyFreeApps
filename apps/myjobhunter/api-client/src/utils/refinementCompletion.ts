import type { RefinementCompletion } from "../types/resume-refinement/refinement-completion";
import type { RefinementSession } from "../types/resume-refinement/refinement-session";

/**
 * Where the session stands on finishing. Only meaningful once the session is active or completed:
 * while it's still preparing there are no targets yet, which would read as "nothing to flag".
 */
export function refinementCompletion(session: Pick<RefinementSession, "status" | "improvement_targets" | "target_index">): RefinementCompletion {
  if (session.status === "completed") return "completed";
  const targets = session.improvement_targets ?? [];
  if (session.target_index < targets.length) return "hidden";
  return targets.length === 0 ? "empty" : "reviewed";
}
