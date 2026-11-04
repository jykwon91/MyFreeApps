import { LoadingButton, useTheme } from "@platform/mobile";
import { Linking, Text, View } from "react-native";

interface CameraPermissionPromptProps {
  /** After a refusal the system won't ask again: only Settings can change it. */
  canAsk: boolean;
  onAsk: () => Promise<unknown>;
}

export default function CameraPermissionPrompt({ canAsk, onAsk }: CameraPermissionPromptProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: "center", gap: spacing.lg, padding: spacing.xl }}>
      <Text style={{ textAlign: "center", fontSize: fontSize.md, color: colors.foreground }}>
        I need camera access to read your receipts.
      </Text>
      <LoadingButton onPress={async () => {
          await (canAsk ? onAsk() : Linking.openSettings());
        }}>
        {canAsk ? "Allow camera" : "Open Settings"}
      </LoadingButton>
    </View>
  );
}
