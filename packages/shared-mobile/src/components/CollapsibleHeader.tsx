import { Pressable, Text, View } from "react-native";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { CollapsibleHeaderProps } from "../types/CollapsibleHeaderProps";

const HIDDEN_FROM_READER = { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" } as const;

/**
 * The heading of a section that folds open and shut. A screen reader gives one control only one role, so a button
 * that held the title would hide it from the list of headings. The title is its own heading and the open/close
 * control sits beside it, while a sighted user can still tap anywhere on the row.
 */
export default function CollapsibleHeader({
  title,
  headingLabel,
  isOpen,
  onToggle,
  action,
  actionLabel,
  actionHint,
  leading,
  aside,
  below,
  titleSize = "md",
  style,
}: CollapsibleHeaderProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <Pressable accessible={false} onPress={onToggle} style={[{ gap: spacing.xs }, style]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        {leading ? <View {...HIDDEN_FROM_READER}>{leading}</View> : null}
        <Text
          accessibilityLabel={headingLabel}
          accessibilityRole="header"
          style={{ flex: 1, fontSize: fontSize[titleSize], fontWeight: "600", color: colors.foreground }}
        >
          {title}
        </Text>
        {aside ? <View {...HIDDEN_FROM_READER}>{aside}</View> : null}
        <Pressable
          accessibilityHint={actionHint}
          accessibilityLabel={actionLabel ?? title}
          accessibilityRole="button"
          accessibilityState={{ expanded: isOpen }}
          onPress={onToggle}
          style={{ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
        >
          {action}
        </Pressable>
      </View>
      {below ? <View {...HIDDEN_FROM_READER}>{below}</View> : null}
    </Pressable>
  );
}
