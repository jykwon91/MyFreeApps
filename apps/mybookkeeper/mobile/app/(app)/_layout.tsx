import { ToastProvider, useTheme } from "@platform/mobile";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SINGLE_COPY_SCREENS } from "../../src/constants/singleCopyScreens";
import { TOAST_CLEARANCE } from "../../src/constants/toast";
import { useResumeUploads } from "../../src/features/capture/useResumeUploads";
import PrivacyCover from "../../src/features/shell/PrivacyCover";
import WorkspaceGate from "../../src/features/workspace/WorkspaceGate";
import WorkspaceLostToast from "../../src/features/workspace/WorkspaceLostToast";

export default function AppLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  useResumeUploads();
  return (
    <WorkspaceGate>
      <ToastProvider bottomOffset={insets.bottom + TOAST_CLEARANCE}>
        <WorkspaceLostToast />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="(tabs)" options={{ title: "Home" }} />
          {SINGLE_COPY_SCREENS.map((name) => (
            <Stack.Screen dangerouslySingular key={name} name={name} options={name === "camera" ? { presentation: "fullScreenModal" } : undefined} />
          ))}
        </Stack>
        <PrivacyCover />
      </ToastProvider>
    </WorkspaceGate>
  );
}
