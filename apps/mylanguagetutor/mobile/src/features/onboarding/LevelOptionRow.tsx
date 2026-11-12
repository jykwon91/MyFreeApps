import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import type { LevelOptionRowProps } from "../../types/LevelOptionRowProps";

/** One starting point to choose, with what it means. */
export default function LevelOptionRow({ option, isSelected, onPress }: LevelOptionRowProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <Pressable
      accessibilityHint={option.description}
      accessibilityLabel={option.label}
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        gap: spacing.xs,
        padding: spacing.lg,
        borderWidth: isSelected ? 2 : 1,
        borderRadius: radius.md,
        borderColor: isSelected ? colors.primary : colors.border,
        backgroundColor: pressed ? colors.muted : colors.card,
      })}
    >
      <Text style={{ color: colors.foreground, fontSize: fontSize.md, fontWeight: "600" }}>{option.label}</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{option.description}</Text>
    </Pressable>
  );
}
