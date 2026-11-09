import { Pressable, Text, View } from "react-native";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { PickerFieldProps } from "../types/PickerFieldProps";

/** Looks like a FormField but opens a list of choices instead of the keyboard. */
export default function PickerField({ label, valueLabel, onPress, hint, disabled = false }: PickerFieldProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text importantForAccessibility="no" accessibilityElementsHidden style={{ color: colors.foreground, fontSize: fontSize.xs, fontWeight: "500" }}>
        {label}
      </Text>
      <Pressable
        accessibilityHint={hint}
        accessibilityLabel={`${label}, ${valueLabel}`}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => ({
          minHeight: MIN_TOUCH_TARGET,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          borderWidth: 1,
          borderRadius: radius.md,
          borderColor: colors.input,
          backgroundColor: pressed ? colors.muted : colors.background,
          opacity: disabled ? 0.5 : 1,
        })}
      >
        <Text style={{ flex: 1, color: colors.foreground, fontSize: fontSize.md }}>{valueLabel}</Text>
        <Text importantForAccessibility="no" style={{ color: colors.mutedForeground, fontSize: fontSize.md }}>
          ›
        </Text>
      </Pressable>
      {hint ? <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{hint}</Text> : null}
    </View>
  );
}
