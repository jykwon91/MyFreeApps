import { LEVEL_OPTIONS } from "@mylanguagetutor/api-client/constants/levelOptions";
import { ONBOARDING_COPY } from "@mylanguagetutor/api-client/constants/onboardingCopy";
import { ONBOARDING_LANGUAGE_PATH } from "@mylanguagetutor/api-client/constants/onboardingLanguagePath";
import { useLevelChoice } from "@mylanguagetutor/api-client/hooks/useLevelChoice";
import { LoadingButton, useTheme, useToast } from "@platform/mobile";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import { LEVEL_SKELETON_ROWS } from "../../constants/catalog";
import { LOADING_LEVEL_MESSAGE } from "../../constants/onboarding";
import { PRACTICE_PATH } from "../../constants/routes";
import CardListSkeleton from "../catalog/CardListSkeleton";
import LevelOptionRow from "./LevelOptionRow";
import OnboardingIntro from "./OnboardingIntro";

/** Onboarding step 2, and "Change level" later: how much the learner already knows. */
export default function LevelScreen() {
  const { colors, spacing } = useTheme();
  const { showToast } = useToast();
  const { language } = useLocalSearchParams<{ language?: string }>();
  const { languageCode, selected, pick, isProfilePending, isFirstTime, isSaving, save } = useLevelChoice(language ?? null);

  if (!languageCode) {
    // Profile still loading: wait; no profile and no language chosen: step 1.
    if (isProfilePending) return <CardListSkeleton accessibilityLabel={LOADING_LEVEL_MESSAGE} rows={LEVEL_SKELETON_ROWS} />;
    return <Redirect href={ONBOARDING_LANGUAGE_PATH} />;
  }

  async function submit(): Promise<void> {
    if (await save()) router.dismissTo(PRACTICE_PATH);
    else showToast(ONBOARDING_COPY.saveFailed, "error");
  }

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }} style={{ backgroundColor: colors.background }}>
      <OnboardingIntro
        heading={ONBOARDING_COPY.levelHeading}
        intro={ONBOARDING_COPY.levelIntro}
        step={isFirstTime ? ONBOARDING_COPY.levelStep : undefined}
      />
      <View accessibilityLabel={ONBOARDING_COPY.levelLegend} accessibilityRole="radiogroup" style={{ gap: spacing.md }}>
        {LEVEL_OPTIONS.map((option) => (
          <LevelOptionRow isSelected={selected === option.value} key={option.value} onPress={() => pick(option.value)} option={option} />
        ))}
      </View>
      <LoadingButton disabled={!selected} isLoading={isSaving} loadingText={ONBOARDING_COPY.saving} onPress={submit}>
        {ONBOARDING_COPY.continue}
      </LoadingButton>
    </ScrollView>
  );
}
