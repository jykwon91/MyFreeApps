import { confirmSecurityChange, TwoStepScreen, useRefocusSignal } from "@platform/mobile";
import { router, Stack } from "expo-router";
import { WEB_BASE_URL } from "../../../src/constants/api";
import {
  SECURITY_BACK_TITLE,
  SECURITY_SCREEN_TITLE,
  WHAT_TWO_STEP_PROTECTS,
} from "../../../src/constants/security";

export default function SecurityRoute() {
  // The screen has already loaded on first focus. After that, turning on may have changed it.
  const reloadSignal = useRefocusSignal();

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: SECURITY_SCREEN_TITLE, headerBackTitle: SECURITY_BACK_TITLE }} />
      <TwoStepScreen
        confirmOwner={confirmSecurityChange}
        onTurnOn={() => router.push("/security/turn-on")}
        reloadSignal={reloadSignal}
        webBaseUrl={WEB_BASE_URL}
        webPath="/security"
        whatItProtects={WHAT_TWO_STEP_PROTECTS}
      />
    </>
  );
}
