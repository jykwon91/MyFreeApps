import { TOAST_CLEARANCE, ToastProvider, useStackScreenOptions } from "@platform/mobile";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SINGLE_COPY_SCREENS } from "../../src/constants/singleCopyScreens";

// A cold deep link to a screen above the tabs, like /onboarding/level, still has the tabs underneath.
export const unstable_settings = { anchor: "(tabs)" };

export default function AppLayout() {
  const stackOptions = useStackScreenOptions();
  const insets = useSafeAreaInsets();
  return (
    <ToastProvider bottomOffset={insets.bottom + TOAST_CLEARANCE}>
      <Stack screenOptions={{ ...stackOptions, headerShown: false }}>
        {SINGLE_COPY_SCREENS.map((name) => (
          <Stack.Screen dangerouslySingular key={name} name={name} />
        ))}
      </Stack>
    </ToastProvider>
  );
}
