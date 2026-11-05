import { TwoStepScreen } from "@platform/mobile";
import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { WEB_BASE_URL } from "../../../src/constants/api";
import {
  SECURITY_BACK_TITLE,
  SECURITY_SCREEN_TITLE,
  WHAT_TWO_STEP_PROTECTS,
} from "../../../src/constants/security";
import { confirmSecurityChange } from "../../../src/features/security/confirmSecurityChange";

export default function SecurityRoute() {
  const [reloadSignal, setReloadSignal] = useState(0);
  const isFirstFocus = useRef(true);

  // The screen has already loaded on first focus. After that, turning on may have changed it.
  useFocusEffect(
    useCallback(() => {
      if (!isFirstFocus.current) setReloadSignal((signal) => signal + 1);
      isFirstFocus.current = false;
    }, []),
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: SECURITY_SCREEN_TITLE, headerBackTitle: SECURITY_BACK_TITLE }} />
      <TwoStepScreen
        confirmOwner={confirmSecurityChange}
        onTurnOn={() => router.push("/security/turn-on")}
        reloadSignal={reloadSignal}
        websiteUrl={`${WEB_BASE_URL}/security`}
        whatItProtects={WHAT_TWO_STEP_PROTECTS}
      />
    </>
  );
}
