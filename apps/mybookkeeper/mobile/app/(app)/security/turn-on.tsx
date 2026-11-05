import { TWO_STEP_MESSAGES } from "@platform/mobile";
import { Stack } from "expo-router";
import { SECURITY_SCREEN_TITLE } from "../../../src/constants/security";
import SecurityTurnOnScreen from "../../../src/features/security/SecurityTurnOnScreen";

export default function SecurityTurnOnRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: TWO_STEP_MESSAGES.heading, headerBackTitle: SECURITY_SCREEN_TITLE }} />
      <SecurityTurnOnScreen />
    </>
  );
}
