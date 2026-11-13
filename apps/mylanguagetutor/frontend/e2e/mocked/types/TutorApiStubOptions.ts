import type { Language } from "@mylanguagetutor/api-client/types/catalog/language";
import type { Profile } from "@mylanguagetutor/api-client/types/tutor/profile";
import type { UsageToday } from "@mylanguagetutor/api-client/types/tutor/usage-today";
import type { Gate } from "@platform/ui/test-support/types/Gate";
import type { TurnScript } from "./TurnScript";

export interface TutorApiStubOptions {
  /** The learner's saved onboarding choices; null before onboarding. A Spanish beginner unless given. */
  profile?: Profile | null;
  /** GET /usage/today; plenty left and the tutor on unless given. */
  usage?: UsageToday;
  /** GET /languages; Spanish unless given. */
  languages?: Language[];
  /** How each turn is answered, in order; a turn past the end gets a plain reply. */
  turns?: TurnScript[];
  /** Holds every turn's answer until released, to see the page while it waits. */
  holdTurns?: Gate;
  /** Endpoints that answer 500 until stopFailing(key), keyed `${METHOD} ${path}` like "PUT /profile". */
  failWith?: string[];
}
