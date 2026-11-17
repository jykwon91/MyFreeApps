import { useTheme } from "@platform/mobile";
import { Redirect, router } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AiPermissionPanel from "../../src/features/aiPermission/AiPermissionPanel";
import { useHasAiPermission } from "../../src/features/aiPermission/useHasAiPermission";
import CaptureScreen from "../../src/features/capture/CaptureScreen";
import { useCanWrite } from "../../src/features/workspace/useCanWrite";

export default function CameraRoute() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const canWrite = useCanWrite();
  const isAllowed = useHasAiPermission();
  if (!canWrite) return <Redirect href="/money" />;
  // The route is a headerless full-screen modal, so this is the one place every state clears the status bar and home indicator.
  return (
    <View testID="camera-route" style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {isAllowed ? <CaptureScreen /> : <AiPermissionPanel onNotNow={() => router.dismissTo("/money")} />}
    </View>
  );
}
