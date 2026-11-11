import { useListEducationQuery } from "@myjobhunter/api-client/store/educationApi";
import { useGetProfileQuery } from "@myjobhunter/api-client/store/profileApi";
import { useListScreeningAnswersQuery } from "@myjobhunter/api-client/store/screeningAnswersApi";
import { useListSkillsQuery } from "@myjobhunter/api-client/store/skillsApi";
import { useListWorkHistoryQuery } from "@myjobhunter/api-client/store/workHistoryApi";
import { Banner, EmptyState, SHOWING_LAST_LOADED_MESSAGE, useRefresh, useTheme } from "@platform/mobile";
import { ScrollView } from "react-native";
import { PROFILE_MESSAGES as MESSAGES } from "../../constants/profile";
import { profileListState } from "../../lib/profileListState";
import AboutSection from "./AboutSection";
import EducationSection from "./EducationSection";
import PreferencesSection from "./PreferencesSection";
import ProfileSkeleton from "./ProfileSkeleton";
import ScreeningAnswersSection from "./ScreeningAnswersSection";
import SkillsSection from "./SkillsSection";
import WorkHistorySection from "./WorkHistorySection";

/**
 * Everything the website's Profile page holds except the resume upload, which is the Resume
 * screen's: about you, job preferences, work history, education, skills and screening answers.
 * Each list loads, fails and retries on its own; only the profile itself holds up the screen.
 */
export default function ProfileScreen() {
  const { spacing } = useTheme();
  const { data: profile, error, isFetching, refetch } = useGetProfileQuery();
  const workHistory = useListWorkHistoryQuery();
  const education = useListEducationQuery();
  const skills = useListSkillsQuery();
  const answers = useListScreeningAnswersQuery();
  const lists = [workHistory, education, skills, answers];
  const { refresh, isRefreshing, refreshControl } = useRefresh(() => Promise.all([refetch(), ...lists.map((list) => list.refetch())]), error);

  if (!profile && (isFetching || !error)) return <ProfileSkeleton />;
  if (!profile) {
    return (
      <EmptyState
        action={{ label: MESSAGES.tryAgain, onPress: refresh, isLoading: isRefreshing }}
        body={MESSAGES.tryAgainOffer}
        heading={MESSAGES.couldntLoad}
      />
    );
  }

  // A failed refresh keeps what was loaded on screen under a banner; a list that never loaded says so itself.
  const isStale = Boolean(error) || lists.some((list) => list.data !== undefined && list.isError);

  return (
    <ScrollView
      contentContainerStyle={{ gap: spacing.xl, padding: spacing.lg }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
      testID="profile"
    >
      {isStale ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <AboutSection profile={profile} />
      <PreferencesSection profile={profile} />
      <WorkHistorySection state={profileListState(workHistory)} />
      <EducationSection state={profileListState(education)} />
      <SkillsSection state={profileListState(skills)} />
      <ScreeningAnswersSection state={profileListState(answers)} />
    </ScrollView>
  );
}
