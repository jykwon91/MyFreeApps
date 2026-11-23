import { LOADING_COPY } from "@mylanguagetutor/api-client/constants/loadingCopy";
import { LEVEL_OPTIONS } from "@mylanguagetutor/api-client/constants/levelOptions";
import { LEVEL_SAVE_FAILURE_COPY, ONBOARDING_COPY } from "@mylanguagetutor/api-client/constants/onboardingCopy";
import { ONBOARDING_LANGUAGE_PATH } from "@mylanguagetutor/api-client/constants/onboardingLanguagePath";
import { useLevelChoice } from "@mylanguagetutor/api-client/hooks/useLevelChoice";
import { Banner, LoadingButton, useTheme } from "@platform/mobile";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import { LEVEL_SKELETON_ROWS } from "../../constants/catalog";
import { PRACTICE_PATH } from "../../constants/routes";
import CardListSkeleton from "../catalog/CardListSkeleton";
import CatalogLoadError from "../catalog/CatalogLoadError";
import LevelOptionRow from "./LevelOptionRow";
import OnboardingIntro from "./OnboardingIntro";

/** Onboarding step 2, and "Change level" later: how much the learner already knows. */
export default function LevelScreen() {
  const { colors, spacing } = useTheme();
  const { language } = useLocalSearchParams<{ language?: string }>();
  const { languageCode, selected, pick, isPending, loadFailed, retry, isRetrying, isFirstTime, isSaving, saveFailure, save } = useLevelChoice(language ?? null);

  if (!languageCode) {
    // Still loading: wait; the profile won't load: offer a retry; no usable language chosen: step 1.
    if (isPending) return <CardListSkeleton accessibilityLabel={LOADING_COPY.level} rows={LEVEL_SKELETON_ROWS} />;
    if (loadFailed) return <CatalogLoadError isRetrying={isRetrying} onRetry={retry} />;
    return <Redirect href={ONBOARDING_LANGUAGE_PATH} />;
  }

  async function submit(): Promise<void> {
    const outcome = await save();
    if (outcome === "saved") router.dismissTo(PRACTICE_PATH);
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
      {saveFailure && <Banner message={LEVEL_SAVE_FAILURE_COPY[saveFailure]} />}
      <LoadingButton disabled={!selected} isLoading={isSaving} loadingText={ONBOARDING_COPY.saving} onPress={submit}>
        {ONBOARDING_COPY.continue}
      </LoadingButton>
    </ScrollView>
  );
}
