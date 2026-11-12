import { SECURITY_MESSAGES, SecurityScreen, useRefocusSignal } from "@platform/mobile";
import { router, Stack } from "expo-router";
import { API_BASE_URL } from "../../src/constants/api";
import { DATA_EXPORT_FILE_PREFIX } from "../../src/constants/dataExport";
import {
  DELETE_ACCOUNT_ROUTE,
  SECURITY_BACK_TITLE,
  SECURITY_CONTENT,
  SECURITY_INTRO_DISMISSED_KEY,
  SECURITY_TURN_ON_ROUTE,
} from "../../src/constants/security";
import SignedInOnly from "../../src/features/account/SignedInOnly";
import { session } from "../../src/lib/session";

export default function SecurityRoute() {
  // The screen has already loaded on first focus. After that, turning on may have changed it.
  const reloadSignal = useRefocusSignal();

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: SECURITY_MESSAGES.screenTitle, headerBackTitle: SECURITY_BACK_TITLE }} />
      <SignedInOnly>
        <SecurityScreen
          content={SECURITY_CONTENT}
          dataExport={{ apiBaseUrl: API_BASE_URL, session, filePrefix: DATA_EXPORT_FILE_PREFIX }}
          introDismissedKey={SECURITY_INTRO_DISMISSED_KEY}
          onDeleteAccount={() => router.push(DELETE_ACCOUNT_ROUTE)}
          onTurnOn={() => router.push(SECURITY_TURN_ON_ROUTE)}
          reloadSignal={reloadSignal}
        />
      </SignedInOnly>
    </>
  );
}
