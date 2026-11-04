import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";

export default function HomeLinkRow({
  label,
  detail,
  detailColor,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  detail?: string;
  detailColor?: string;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      onPress={onPress}
      style={{ minHeight: MIN_TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: spacing.sm }}
    >
      <Text numberOfLines={1} style={{ flex: 1, fontSize: fontSize.md, color: colors.foreground }}>
        {label}
      </Text>
      {detail ? (
        <Text style={{ fontSize: fontSize.md, fontVariant: ["tabular-nums"], color: detailColor ?? colors.foreground }}>{detail}</Text>
      ) : null}
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={{ fontSize: fontSize.lg, color: colors.mutedForeground }}
      >
        {"\u203A"}
      </Text>
    </Pressable>
  );
}
