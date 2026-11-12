import type { Profile } from "@mylanguagetutor/api-client/types/tutor/profile";

export interface ConversationLoaderProps {
  profile: Profile;
  scenarioSlug: string;
}
