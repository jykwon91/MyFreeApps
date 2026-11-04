import { SessionPendingScreen, useSession, useTheme } from "@platform/mobile";
import { Stack } from "expo-router";

export default function RootStack() {
  const { state } = useSession();
  const { colors } = useTheme();
  if (state.status === "restoring" || state.status === "unreadable") return <SessionPendingScreen />;

  const isSignedIn = state.status === "signedIn";
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={isSignedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}
