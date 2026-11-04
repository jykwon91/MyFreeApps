import { SessionProvider, useTheme } from "@platform/mobile";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Provider } from "react-redux";
import AccountNotice from "../src/features/account/AccountNotice";
import { useCookTimerAlertTaps } from "../src/features/cook/useCookTimerAlertTaps";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { showCookTimerAlertsInForeground } from "../src/services/cookTimerNotifications";

showCookTimerAlertsInForeground();

// A link straight to a recipe still has the tabs behind it to go back to.
export const unstable_settings = { anchor: "(tabs)" };

export default function RootLayout() {
  const { colors } = useTheme();
  useCookTimerAlertTaps();

  return (
    <Provider store={store}>
      <SessionProvider session={session}>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.card },
            headerTintColor: colors.foreground,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="delete-account" options={{ title: "Delete account", headerBackTitle: "Settings" }} />
          <Stack.Screen name="sign-in" options={{ presentation: "modal", title: "" }} />
        </Stack>
        <AccountNotice />
      </SessionProvider>
    </Provider>
  );
}
