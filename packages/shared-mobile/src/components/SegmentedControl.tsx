import { Pressable, Text, View } from "react-native";
import { DISABLED_OPACITY } from "../constants/loadingButton";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { SegmentedControlProps } from "../types/SegmentedControlProps";

export default function SegmentedControl<Value extends string>({
  segments,
  value,
  onChange,
  accessibilityLabel,
  disabled = false,
}: SegmentedControlProps<Value>) {
  const { colors, spacing, radius, fontSize } = useTheme();

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tablist"
      style={{ flexDirection: "row", gap: spacing.xs, padding: spacing.xs, borderRadius: radius.md, backgroundColor: colors.muted }}
    >
      {segments.map((segment) => {
        const isSelected = segment.value === value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected, disabled }}
            disabled={disabled}
            key={segment.value}
            onPress={() => onChange(segment.value)}
            style={{
              flex: 1,
              minHeight: MIN_TOUCH_TARGET,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.md,
              backgroundColor: isSelected ? colors.card : "transparent",
              opacity: disabled ? DISABLED_OPACITY : 1,
            }}
          >
            <Text
              style={{
                fontSize: fontSize.sm,
                fontWeight: isSelected ? "600" : "400",
                color: isSelected ? colors.foreground : colors.mutedForeground,
              }}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
