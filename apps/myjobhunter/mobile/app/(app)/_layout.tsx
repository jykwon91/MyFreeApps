import { TOAST_CLEARANCE, ToastProvider, useStackScreenOptions } from "@platform/mobile";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AppLayout() {
  const stackOptions = useStackScreenOptions();
  const insets = useSafeAreaInsets();
  return (
    <ToastProvider bottomOffset={insets.bottom + TOAST_CLEARANCE}>
      <Stack screenOptions={{ ...stackOptions, headerShown: false }} />
    </ToastProvider>
  );
}
