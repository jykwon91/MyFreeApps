import { KANBAN_LANE_LABELS } from "@myjobhunter/api-client/constants/kanbanLaneLabels";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import { DASHBOARD_MESSAGES as MESSAGES } from "../../constants/dashboard";
import { applicationCount } from "../../lib/boardCardDisplay";
import type { LaneHeaderProps } from "../../types/LaneHeaderProps";

/** A swim lane's heading and count. Folding it hides that lane in every stage, as on the website. */
export default function LaneHeader({ lane, count, isCollapsed, onToggle }: LaneHeaderProps) {
  const { colors, spacing, fontSize } = useTheme();
  const label = KANBAN_LANE_LABELS[lane];
  return (
    <Pressable
      accessibilityHint={MESSAGES.showsLane}
      accessibilityLabel={`${label}, ${applicationCount(count)}`}
      accessibilityRole="button"
      accessibilityState={{ expanded: !isCollapsed }}
      onPress={onToggle}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        minHeight: MIN_TOUCH_TARGET,
        paddingHorizontal: spacing.lg,
        backgroundColor: pressed ? colors.muted : "transparent",
      })}
    >
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{isCollapsed ? "▸" : "▾"}</Text>
      <Text style={{ flex: 1, fontSize: fontSize.xs, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase", color: colors.mutedForeground }}>
        {label}
      </Text>
      <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground, fontVariant: ["tabular-nums"] }}>{count}</Text>
    </Pressable>
  );
}
