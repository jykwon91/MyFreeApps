import { Pressable, Text, View } from "react-native";
import { DISABLED_OPACITY } from "../constants/loadingButton";
import { SEGMENT_GROUP_ROLE, SEGMENT_ROLE } from "../constants/segmentRole";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { SegmentedControlProps } from "../types/SegmentedControlProps";

export default function SegmentedControl<Value extends string>({
  segments,
  value,
  onChange,
  accessibilityLabel,
  disabled = false,
  role = SEGMENT_ROLE.tab,
}: SegmentedControlProps<Value>) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const isRadio = role === SEGMENT_ROLE.radio;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={SEGMENT_GROUP_ROLE[role]}
      style={{ flexDirection: "row", gap: spacing.xs, padding: spacing.xs, borderRadius: radius.md, backgroundColor: colors.muted }}
    >
      {segments.map((segment) => {
        const isSelected = segment.value === value;
        return (
          <Pressable
            accessibilityRole={role}
            // A radio is announced as checked; a tab as selected.
            accessibilityState={isRadio ? { checked: isSelected, selected: isSelected, disabled } : { selected: isSelected, disabled }}
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
