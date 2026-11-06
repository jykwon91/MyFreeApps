import {
  CONTEXT_ACTIVITY_LABEL,
  CONTEXT_CLASS_LABEL,
  CONTEXT_EXPERIENCE_LABEL,
  CONTEXT_FACTION_LABEL,
  CONTEXT_LEVEL_BAND_LABEL,
  CONTEXT_PROFESSION_LABEL,
} from "@/games/wow-forever/data/featureRequests/featureRequestLabels";
import type { TriageSubmissionContext } from "@/games/wow-forever/types/featureRequests/triage/triageSubmissionContext";

/** The submitter's "about you" answers as chip labels (only from the label maps), in a fixed order. Pure. */
export function contextChips(context: TriageSubmissionContext): string[] {
  const chips: string[] = [];
  if (context.class_id !== null) chips.push(CONTEXT_CLASS_LABEL[context.class_id]);
  if (context.level_band !== null) chips.push(CONTEXT_LEVEL_BAND_LABEL[context.level_band]);
  if (context.faction !== null) chips.push(CONTEXT_FACTION_LABEL[context.faction]);
  if (context.experience !== null) chips.push(CONTEXT_EXPERIENCE_LABEL[context.experience]);
  for (const p of context.professions) chips.push(CONTEXT_PROFESSION_LABEL[p]);
  for (const a of context.activities) chips.push(CONTEXT_ACTIVITY_LABEL[a]);
  return chips;
}
