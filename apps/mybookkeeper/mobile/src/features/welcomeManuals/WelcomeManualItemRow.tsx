import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

interface WelcomeManualItemRowProps {
  title: string;
  subtitle?: string | null;
  /** Something to the left, like a photo. */
  leading?: ReactNode;
  accessibilityLabel: string;
  /** Without it the row is plain text, as it is for a viewer. */
  onPress?: () => void;
}

/** One small item of a manual: a field, room, place or photo. */
export default function WelcomeManualItemRow({ title, subtitle, leading, accessibilityLabel, onPress }: WelcomeManualItemRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={onPress ? "button" : "text"}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.background,
      })}
    >
      {leading}
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{subtitle}</Text> : null}
      </View>
      {onPress ? (
        <Text importantForAccessibility="no" style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>
          ›
        </Text>
      ) : null}
    </Pressable>
  );
}
