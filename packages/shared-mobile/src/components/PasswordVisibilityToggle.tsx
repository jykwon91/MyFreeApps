import { Pressable, Text } from "react-native";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { PasswordVisibilityToggleProps } from "../types/PasswordVisibilityToggleProps";

/** The Show / Hide button at the end of a password field. */
export default function PasswordVisibilityToggle({ isVisible, onToggle }: PasswordVisibilityToggleProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <Pressable
      accessibilityLabel={isVisible ? "Hide password" : "Show password"}
      accessibilityRole="button"
      onPress={onToggle}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        minWidth: MIN_TOUCH_TARGET,
        paddingHorizontal: spacing.sm,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: colors.primary, fontSize: fontSize.sm }}>{isVisible ? "Hide" : "Show"}</Text>
    </Pressable>
  );
}
