import { TWO_STEP_MESSAGES, TwoStepTurnOnFlow } from "@platform/mobile";
import { Stack } from "expo-router";
import { APP_NAME } from "../../../src/constants/app";
import { SECURITY_MESSAGES as MESSAGES, SECURITY_ROUTE } from "../../../src/constants/security";

export default function SecurityTurnOnRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: TWO_STEP_MESSAGES.heading, headerBackTitle: MESSAGES.screenTitle }} />
      <TwoStepTurnOnFlow appName={APP_NAME} securityRoute={SECURITY_ROUTE} />
    </>
  );
}
