import { useTheme } from "@platform/mobile";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Provider } from "react-redux";
import { store } from "../src/lib/store";

// A link straight to a recipe still has the tabs behind it to go back to.
export const unstable_settings = { anchor: "(tabs)" };

export default function RootLayout() {
  const { colors } = useTheme();

  return (
    <Provider store={store}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.foreground,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </Provider>
  );
}
