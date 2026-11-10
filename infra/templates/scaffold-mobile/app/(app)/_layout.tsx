import { TOAST_CLEARANCE, ToastProvider, useTheme } from "@platform/mobile";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AppLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ToastProvider bottomOffset={insets.bottom + TOAST_CLEARANCE}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
    </ToastProvider>
  );
}
