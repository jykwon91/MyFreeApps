import { useGetProfileQuery } from "@myjobhunter/api-client/store/profileApi";
import { useListSkillsQuery } from "@myjobhunter/api-client/store/skillsApi";
import { useOpenWebsite } from "@platform/mobile";
import { WEB_BASE_URL } from "../../constants/api";
import { PROFILE_WEB_PATH } from "../../constants/profileBanner";
import ProfileCompletenessBanner from "./ProfileCompletenessBanner";
import { useProfileBannerDismissal } from "./useProfileBannerDismissal";

/**
 * The profile reminder above the inbox, once the profile and skills have loaded and show neither a
 * resume nor a skill. The profile is edited on the website, so its link opens there.
 */
export default function InboxProfileReminder() {
  const { data: profile } = useGetProfileQuery();
  const { data: skills } = useListSkillsQuery();
  const { isDismissed, dismiss } = useProfileBannerDismissal();
  const openWebsite = useOpenWebsite();
  if (!profile || !skills || isDismissed !== false) return null;
  if (profile.resume_file_path != null || skills.total > 0) return null;
  return <ProfileCompletenessBanner onDismiss={dismiss} onSetUp={() => void openWebsite(WEB_BASE_URL, PROFILE_WEB_PATH)} />;
}
