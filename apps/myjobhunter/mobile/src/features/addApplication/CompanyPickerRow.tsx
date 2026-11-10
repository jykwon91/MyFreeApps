import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import type { CompanyPickerRowProps } from "../../types/CompanyPickerRowProps";

/** One company to choose, with its website under the name when there is one. */
export default function CompanyPickerRow({ label, detail = null, onPress, disabled = false }: CompanyPickerRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <Pressable
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        justifyContent: "center",
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.background,
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{label}</Text>
      {detail ? <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{detail}</Text> : null}
    </Pressable>
  );
}
