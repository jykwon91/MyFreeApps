import { Pressable, Text } from "react-native";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { ChipButtonProps } from "../types/ChipButtonProps";

/** A chip that does something when tapped: removes itself, adds a suggestion, or switches on and off. A full touch target tall. */
export default function ChipButton({ label, accessibilityLabel, onPress, isChecked, disabled = false }: ChipButtonProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const isSwitch = isChecked !== undefined;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole={isSwitch ? "checkbox" : "button"}
      accessibilityState={isSwitch ? { checked: isChecked, disabled } : { disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        justifyContent: "center",
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: isChecked ? colors.primary : colors.border,
        backgroundColor: isChecked ? colors.primary : colors.card,
        opacity: disabled ? 0.5 : pressed ? 0.6 : 1,
      })}
    >
      <Text style={{ fontSize: fontSize.sm, color: isChecked ? colors.primaryForeground : colors.foreground }}>{label}</Text>
    </Pressable>
  );
}
