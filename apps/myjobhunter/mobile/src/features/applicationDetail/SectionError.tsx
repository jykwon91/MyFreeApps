import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import type { SectionErrorProps } from "../../types/SectionErrorProps";

/** A section that couldn't load says so where its list would be, with a way to try again. */
export default function SectionError({ message, retryLabel, onRetry }: SectionErrorProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityRole="alert" style={{ fontSize: fontSize.md, color: colors.destructiveText }}>
        {message}
      </Text>
      <LoadingButton onPress={onRetry} variant="secondary">
        {retryLabel}
      </LoadingButton>
    </View>
  );
}
