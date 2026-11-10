import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";

interface WelcomeManualNavRowProps {
  label: string;
  /** What's behind the row, like "3 sections". */
  value?: string;
  disabled?: boolean;
  onPress: () => void;
}

/** A row that opens another screen, so a long manual is explored one screen at a time. */
export default function WelcomeManualNavRow({ label, value, disabled = false, onPress }: WelcomeManualNavRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <Pressable
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
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
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <Text style={{ flex: 1, fontSize: fontSize.md, color: colors.foreground }}>{label}</Text>
      {value ? (
        <View style={{ flexShrink: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
            {value}
          </Text>
        </View>
      ) : null}
      <Text importantForAccessibility="no" style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>
        ›
      </Text>
    </Pressable>
  );
}
