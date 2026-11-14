import { useGetProfileQuery } from "@myjobhunter/api-client/store/profileApi";
import { useListSkillsQuery } from "@myjobhunter/api-client/store/skillsApi";
import { useDismissal } from "@platform/mobile";
import { router } from "expo-router";
import { PROFILE_BANNER_DISMISSED_KEY, PROFILE_ROUTE } from "../../constants/profileBanner";
import ProfileCompletenessBanner from "./ProfileCompletenessBanner";

/**
 * The profile reminder above the inbox, once the profile and skills have loaded and show neither a
 * resume nor a skill. Its link opens the Profile tab.
 */
export default function InboxProfileReminder() {
  const { data: profile } = useGetProfileQuery();
  const { data: skills } = useListSkillsQuery();
  const { isDismissed, dismiss } = useDismissal(PROFILE_BANNER_DISMISSED_KEY);
  if (!profile || !skills || isDismissed !== false) return null;
  if (profile.resume_file_path != null || skills.total > 0) return null;
  return <ProfileCompletenessBanner onDismiss={dismiss} onSetUp={() => router.push(PROFILE_ROUTE)} />;
}
