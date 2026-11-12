import { SECURITY_MESSAGES, TWO_STEP_MESSAGES, TwoStepTurnOnFlow } from "@platform/mobile";
import { Stack } from "expo-router";
import { APP_NAME } from "../../src/constants/app";
import { SECURITY_ROUTE } from "../../src/constants/security";
import SignedInOnly from "../../src/features/account/SignedInOnly";

export default function SecurityTurnOnRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: TWO_STEP_MESSAGES.heading, headerBackTitle: SECURITY_MESSAGES.screenTitle }} />
      <SignedInOnly>
        <TwoStepTurnOnFlow appName={APP_NAME} securityRoute={SECURITY_ROUTE} />
      </SignedInOnly>
    </>
  );
}
