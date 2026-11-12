import { TOAST_CLEARANCE, ToastProvider, useStackScreenOptions } from "@platform/mobile";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SINGLE_COPY_SCREENS } from "../../src/constants/singleCopyScreens";
import { useResumeUploads } from "../../src/features/capture/useResumeUploads";
import PrivacyCover from "../../src/features/shell/PrivacyCover";
import WorkspaceGate from "../../src/features/workspace/WorkspaceGate";
import WorkspaceLostToast from "../../src/features/workspace/WorkspaceLostToast";

export default function AppLayout() {
  const stackOptions = useStackScreenOptions();
  const insets = useSafeAreaInsets();
  useResumeUploads();
  return (
    <>
      {/* Above the gate, so its own messages, like a link that won't open, can show. */}
      <ToastProvider bottomOffset={insets.bottom + TOAST_CLEARANCE}>
        <WorkspaceGate>
          <WorkspaceLostToast />
          <Stack screenOptions={{ ...stackOptions, headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ title: "Home" }} />
            {SINGLE_COPY_SCREENS.map((name) => (
              <Stack.Screen dangerouslySingular key={name} name={name} options={name === "camera" ? { presentation: "fullScreenModal" } : undefined} />
            ))}
          </Stack>
        </WorkspaceGate>
      </ToastProvider>
      {/* After the toast provider, so a toast (which can name a tenant) is covered in the app switcher too. */}
      <PrivacyCover />
    </>
  );
}
