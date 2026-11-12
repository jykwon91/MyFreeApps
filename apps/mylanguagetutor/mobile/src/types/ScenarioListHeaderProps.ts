import type { Profile } from "@mylanguagetutor/api-client/types/tutor/profile";

export interface ScenarioListHeaderProps {
  profile: Profile;
  languageName: string;
  isCapReached: boolean;
  /** A refresh failed, so the list is what was loaded before. */
  isStale: boolean;
}
