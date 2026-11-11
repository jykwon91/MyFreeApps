import { KANBAN_COLUMN_LABELS } from "@myjobhunter/api-client/constants/kanbanColumnLabels";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { DASHBOARD_MESSAGES as MESSAGES } from "../../constants/dashboard";
import { applicationCount } from "../../lib/boardCardDisplay";
import type { StageHeaderProps } from "../../types/StageHeaderProps";

/** A stage's heading and count. Closed's opens and folds away, as the website's accordion does. */
export default function StageHeader({ column, count, isCollapsible, isOpen, onToggle }: StageHeaderProps) {
  const { colors, spacing, fontSize } = useTheme();
  const label = KANBAN_COLUMN_LABELS[column];
  const row = { flexDirection: "row" as const, alignItems: "center" as const, gap: spacing.sm, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.lg, paddingTop: spacing.md };
  const title = (
    <>
      {isCollapsible ? <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{isOpen ? "▾" : "▸"}</Text> : null}
      <Text style={{ flex: 1, fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>{label}</Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground, fontVariant: ["tabular-nums"] }}>{count}</Text>
    </>
  );

  if (!isCollapsible) {
    return (
      <View accessibilityLabel={`${label}, ${applicationCount(count)}`} accessibilityRole="header" accessible style={row}>
        {title}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityHint={MESSAGES.showsClosed}
      accessibilityLabel={`${label}, ${applicationCount(count)}`}
      accessibilityRole="button"
      accessibilityState={{ expanded: isOpen }}
      onPress={onToggle}
      style={({ pressed }) => [row, { backgroundColor: pressed ? colors.muted : "transparent" }]}
    >
      {title}
    </Pressable>
  );
}
