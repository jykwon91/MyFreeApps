import { useTheme } from "@platform/mobile";
import { Stack } from "expo-router";
import WorkspaceGate from "../../src/features/workspace/WorkspaceGate";

export default function AppLayout() {
  const { colors } = useTheme();
  return (
    <WorkspaceGate>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
    </WorkspaceGate>
  );
}
