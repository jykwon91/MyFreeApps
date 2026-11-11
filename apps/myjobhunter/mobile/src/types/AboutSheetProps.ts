import type { Profile } from "@myjobhunter/api-client/types/profile/profile";

export interface AboutSheetProps {
  profile: Profile;
  onClose: () => void;
}
