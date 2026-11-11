import { KANBAN_COLUMN_ORDER } from "@myjobhunter/api-client/constants/kanbanColumnOrder";
import { Banner, SHOWING_LAST_LOADED_MESSAGE, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { DASHBOARD_MESSAGES as MESSAGES } from "../../constants/dashboard";
import { applicationCount } from "../../lib/boardCardDisplay";
import type { DashboardSummaryProps } from "../../types/DashboardSummaryProps";
import StageTile from "./StageTile";

/** The board at a glance: how many applications, and how many sit in each stage. */
export default function DashboardSummary({ counts, total, isStale, onShowStage }: DashboardSummaryProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.md, padding: spacing.lg }}>
      {isStale ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
          {MESSAGES.summaryTitle}
        </Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{`${applicationCount(total)} ${MESSAGES.onYourBoard}`}</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {KANBAN_COLUMN_ORDER.map((column) => (
          <StageTile column={column} count={counts[column]} key={column} onPress={() => onShowStage(column)} />
        ))}
      </View>
    </View>
  );
}
