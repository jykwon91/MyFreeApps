import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";

export default function LoadMoreFailed({ onRetry }: { onRetry: () => void }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.sm, padding: spacing.lg }}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>I couldn't load more.</Text>
      <LoadingButton onPress={onRetry} variant="secondary">
        Try again
      </LoadingButton>
    </View>
  );
}
