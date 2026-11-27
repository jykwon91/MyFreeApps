import { SessionPendingScreen, useSession, useStackScreenOptions } from "@platform/mobile";
import { Stack } from "expo-router";

export default function RootStack() {
  const { state } = useSession();
  const stackOptions = useStackScreenOptions();
  if (state.status === "restoring" || state.status === "unreadable") return <SessionPendingScreen />;

  const isSignedIn = state.status === "signedIn";
  return (
    <Stack screenOptions={{ ...stackOptions, headerShown: false }}>
      <Stack.Protected guard={isSignedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="sign-in" />
        {/* Opened from sign-in, so they push over it and go back to it. */}
        <Stack.Screen name="register" options={{ headerShown: true, title: "", headerBackTitle: "Sign in" }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: true, title: "", headerBackTitle: "Sign in" }} />
      </Stack.Protected>
    </Stack>
  );
}
