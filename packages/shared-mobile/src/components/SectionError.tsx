import { Text, View } from "react-native";
import { useAnnouncement } from "../hooks/useAnnouncement";
import { useTheme } from "../theme/useTheme";
import type { SectionErrorProps } from "../types/SectionErrorProps";
import LoadingButton from "./LoadingButton";

/** A section that couldn't load says so where its list would be, with a way to try again. The reason is read out politely on both platforms, so several on one screen don't cut each other off. */
export default function SectionError({ message, retryLabel, onRetry }: SectionErrorProps) {
  const { colors, spacing, fontSize } = useTheme();
  useAnnouncement(message, "polite");
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
