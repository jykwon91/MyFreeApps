import { Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";
import type { EmptyStateProps } from "../types/EmptyStateProps";
import LoadingButton from "./LoadingButton";

export default function EmptyState({ heading, body, icon, action }: EmptyStateProps) {
  const { colors, spacing, fontSize } = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        paddingVertical: spacing.xxl,
        paddingHorizontal: spacing.lg,
        gap: spacing.md,
      }}
    >
      {icon ?? null}
      <Text
        accessibilityRole="header"
        style={{
          color: colors.foreground,
          fontSize: fontSize.lg,
          fontWeight: "600",
          textAlign: "center",
        }}
      >
        {heading}
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm, textAlign: "center" }}>
        {body}
      </Text>
      {action ? (
        <LoadingButton isLoading={action.isLoading} loadingText={action.loadingText} onPress={action.onPress}>
          {action.label}
        </LoadingButton>
      ) : null}
    </View>
  );
}
