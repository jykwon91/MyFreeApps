import { ToastProvider, useTheme } from "@platform/mobile";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TOAST_CLEARANCE } from "../../src/constants/toast";
import { useResumeUploads } from "../../src/features/capture/useResumeUploads";
import PrivacyCover from "../../src/features/shell/PrivacyCover";
import WorkspaceGate from "../../src/features/workspace/WorkspaceGate";

export default function AppLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  useResumeUploads();
  return (
    <WorkspaceGate>
      <ToastProvider bottomOffset={insets.bottom + TOAST_CLEARANCE}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="camera" options={{ presentation: "fullScreenModal" }} />
        </Stack>
        <PrivacyCover />
      </ToastProvider>
    </WorkspaceGate>
  );
}
