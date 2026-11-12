import { Stack } from "expo-router";
import { ONBOARDING_SCREEN_TITLES } from "../../../src/constants/onboarding";
import LevelScreen from "../../../src/features/onboarding/LevelScreen";

export default function OnboardingLevelRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: ONBOARDING_SCREEN_TITLES.level }} />
      <LevelScreen />
    </>
  );
}
