import { KANBAN_COLUMN_LABELS } from "@myjobhunter/api-client/constants/kanbanColumnLabels";
import { CollapsibleHeader, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { DASHBOARD_MESSAGES as MESSAGES } from "../../constants/dashboard";
import { applicationCount } from "../../lib/boardCardDisplay";
import type { StageHeaderProps } from "../../types/StageHeaderProps";

/** A stage's heading and count. Closed's opens and folds away, as the website's accordion does. */
export default function StageHeader({ column, count, isCollapsible, isOpen, onToggle }: StageHeaderProps) {
  const { colors, spacing, fontSize } = useTheme();
  const label = KANBAN_COLUMN_LABELS[column];
  const inset = { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.lg, paddingTop: spacing.md };
  const row = { ...inset, flexDirection: "row" as const, alignItems: "center" as const, gap: spacing.sm };
  const accessibleName = `${label}, ${applicationCount(count)}`;
  const countText = <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground, fontVariant: ["tabular-nums"] }}>{count}</Text>;

  if (!isCollapsible) {
    return (
      <View accessibilityLabel={accessibleName} accessibilityRole="header" accessible style={row}>
        <Text style={{ flex: 1, fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>{label}</Text>
        {countText}
      </View>
    );
  }
  return (
    <CollapsibleHeader
      action={<Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{isOpen ? "▾" : "▸"}</Text>}
      actionHint={MESSAGES.showsClosed}
      actionLabel={accessibleName}
      aside={countText}
      headingLabel={accessibleName}
      isOpen={isOpen}
      onToggle={onToggle}
      style={inset}
      title={label}
      titleSize="lg"
    />
  );
}
