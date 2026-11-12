import { Stack } from "expo-router";
import { ONBOARDING_SCREEN_TITLES } from "../../../src/constants/onboarding";
import LanguageScreen from "../../../src/features/onboarding/LanguageScreen";

export default function OnboardingLanguageRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: ONBOARDING_SCREEN_TITLES.language }} />
      <LanguageScreen />
    </>
  );
}
