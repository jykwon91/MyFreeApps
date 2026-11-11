import { KANBAN_COLUMN_LABELS } from "@myjobhunter/api-client/constants/kanbanColumnLabels";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import { DASHBOARD_MESSAGES as MESSAGES, STAGE_TILE_BASIS } from "../../constants/dashboard";
import { applicationCount } from "../../lib/boardCardDisplay";
import type { StageTileProps } from "../../types/StageTileProps";

/** One stage's count, the number a website column heads with. Tapping it scrolls to that stage. */
export default function StageTile({ column, count, onPress }: StageTileProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const label = KANBAN_COLUMN_LABELS[column];
  return (
    <Pressable
      accessibilityHint={MESSAGES.showsStage}
      accessibilityLabel={`${label}, ${applicationCount(count)}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexBasis: STAGE_TILE_BASIS,
        flexGrow: 1,
        minHeight: MIN_TOUCH_TARGET,
        gap: spacing.xs,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        backgroundColor: pressed ? colors.muted : colors.card,
      })}
      testID={`stage-tile-${column}`}
    >
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{label}</Text>
      <Text style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground, fontVariant: ["tabular-nums"] }}>{count}</Text>
    </Pressable>
  );
}
