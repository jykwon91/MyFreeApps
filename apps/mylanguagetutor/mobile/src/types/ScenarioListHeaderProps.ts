import type { SessionBlock } from "@mylanguagetutor/api-client/types/session/session-block";
import type { Profile } from "@mylanguagetutor/api-client/types/tutor/profile";

export interface ScenarioListHeaderProps {
  profile: Profile;
  languageName: string;
  /** Why the learner can't be answered today, or null. */
  block: SessionBlock | null;
  /** Today's usage couldn't load. */
  isUsageError: boolean;
  onRetryUsage: () => Promise<void>;
  /** A refresh failed, so the list is what was loaded before. */
  isStale: boolean;
}
