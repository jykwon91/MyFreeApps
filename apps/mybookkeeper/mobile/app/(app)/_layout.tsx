import { useTheme } from "@platform/mobile";
import { Stack } from "expo-router";
import { useResumeUploads } from "../../src/features/capture/useResumeUploads";
import WorkspaceGate from "../../src/features/workspace/WorkspaceGate";

export default function AppLayout() {
  const { colors } = useTheme();
  useResumeUploads();
  return (
    <WorkspaceGate>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="camera" options={{ presentation: "fullScreenModal" }} />
      </Stack>
    </WorkspaceGate>
  );
}
