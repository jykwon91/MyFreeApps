import type { ContextActivity } from "@/games/wow-forever/types/featureRequests/contextActivity";
import type { ContextClass } from "@/games/wow-forever/types/featureRequests/contextClass";
import type { ContextExperience } from "@/games/wow-forever/types/featureRequests/contextExperience";
import type { ContextFaction } from "@/games/wow-forever/types/featureRequests/contextFaction";
import type { ContextLevelBand } from "@/games/wow-forever/types/featureRequests/contextLevelBand";
import type { ContextProfession } from "@/games/wow-forever/types/featureRequests/contextProfession";

/** The "about you" answers as the triage API returns them: every key present, null when not given. */
export interface TriageSubmissionContext {
  class_id: ContextClass | null;
  experience: ContextExperience | null;
  level_band: ContextLevelBand | null;
  professions: ContextProfession[];
  activities: ContextActivity[];
  faction: ContextFaction | null;
}
