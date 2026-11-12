import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import type { HeaderTextButtonProps } from "../../types/HeaderTextButtonProps";

/** A word-labelled action in a screen's header. */
export default function HeaderTextButton({ label, shortLabel, onPress }: HeaderTextButtonProps) {
  const { colors, spacing, fontSize } = useTheme();

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, justifyContent: "center", paddingHorizontal: spacing.md }}
    >
      <Text style={{ color: colors.primary, fontSize: fontSize.md, fontWeight: "600" }}>{shortLabel}</Text>
    </Pressable>
  );
}
