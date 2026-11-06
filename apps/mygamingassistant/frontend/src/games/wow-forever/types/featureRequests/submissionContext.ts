import type { ContextActivity } from "@/games/wow-forever/types/featureRequests/contextActivity";
import type { ContextClass } from "@/games/wow-forever/types/featureRequests/contextClass";
import type { ContextExperience } from "@/games/wow-forever/types/featureRequests/contextExperience";
import type { ContextFaction } from "@/games/wow-forever/types/featureRequests/contextFaction";
import type { ContextLevelBand } from "@/games/wow-forever/types/featureRequests/contextLevelBand";
import type { ContextProfession } from "@/games/wow-forever/types/featureRequests/contextProfession";

/** The optional "about you" answers sent with an idea. Every field may be left out. */
export interface SubmissionContext {
  class_id?: ContextClass;
  experience?: ContextExperience;
  level_band?: ContextLevelBand;
  professions?: ContextProfession[];
  activities?: ContextActivity[];
  faction?: ContextFaction;
}
