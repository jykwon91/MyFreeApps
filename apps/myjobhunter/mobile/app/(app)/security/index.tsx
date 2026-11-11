import { useRefocusSignal } from "@platform/mobile";
import { Stack } from "expo-router";
import { SECURITY_MESSAGES as MESSAGES } from "../../../src/constants/security";
import SecurityScreen from "../../../src/features/security/SecurityScreen";

export default function SecurityRoute() {
  // The screen has already loaded on first focus. After that, turning on may have changed it.
  const reloadSignal = useRefocusSignal();

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: MESSAGES.screenTitle, headerBackTitle: MESSAGES.backTitle }} />
      <SecurityScreen reloadSignal={reloadSignal} />
    </>
  );
}
