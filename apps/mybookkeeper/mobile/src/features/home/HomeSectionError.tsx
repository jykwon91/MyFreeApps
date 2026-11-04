import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";

export default function HomeSectionError({ message, onRetry }: { message: string; onRetry: () => Promise<void> }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityRole="alert" style={{ fontSize: fontSize.md, color: colors.foreground }}>
        {message}
      </Text>
      <LoadingButton onPress={onRetry} variant="secondary">
        Try again
      </LoadingButton>
    </View>
  );
}
