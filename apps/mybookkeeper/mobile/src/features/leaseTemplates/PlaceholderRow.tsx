import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { placeholderRowLabel, placeholderRowLine } from "./leaseTemplateDisplay";
import type { PlaceholderRowProps } from "../../types/PlaceholderRowProps";

export default function PlaceholderRow({ placeholder, onPress }: PlaceholderRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const content = (
    <>
      <Text numberOfLines={2} style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {placeholder.display_label}
      </Text>
      <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{`[${placeholder.key}]`}</Text>
      <Text numberOfLines={2} style={{ fontSize: fontSize.sm, color: colors.foreground }}>
        {placeholderRowLine(placeholder)}
      </Text>
    </>
  );
  const rowStyle = { minHeight: MIN_TOUCH_TARGET, gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border } as const;

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={placeholderRowLabel(placeholder)} style={rowStyle}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityLabel={placeholderRowLabel(placeholder)}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ ...rowStyle, backgroundColor: pressed ? colors.muted : colors.background })}
    >
      {content}
    </Pressable>
  );
}
