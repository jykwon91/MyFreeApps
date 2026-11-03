import { useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import { COOK_LABEL_MAX_SCALE, COOK_TARGET_HEIGHT } from "../../constants/cook";

export default function CookBarButton({
  accessibilityLabel,
  disabled = false,
  isPrimary = false,
  label,
  onPress,
}: {
  accessibilityLabel?: string;
  disabled?: boolean;
  isPrimary?: boolean;
  label: string;
  onPress: () => void;
}) {
  const { colors, spacing, radius, fontSize } = useTheme();

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: COOK_TARGET_HEIGHT,
        minWidth: COOK_TARGET_HEIGHT,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        backgroundColor: isPrimary ? colors.primary : "transparent",
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <Text
        maxFontSizeMultiplier={COOK_LABEL_MAX_SCALE}
        style={{
          color: isPrimary ? colors.primaryForeground : colors.foreground,
          fontSize: fontSize.md,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
