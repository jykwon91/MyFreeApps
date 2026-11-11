import { KANBAN_COLUMN_ORDER } from "@myjobhunter/api-client/constants/kanbanColumnOrder";
import { MIN_TOUCH_TARGET, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { DASHBOARD_MESSAGES as MESSAGES, STAGE_TILE_BASIS } from "../../constants/dashboard";
import { DASHBOARD_SKELETON_CARDS, DASHBOARD_SKELETON_HEIGHTS as HEIGHTS, DASHBOARD_SKELETON_STAGES } from "../../constants/dashboardSkeleton";
import BoardCardSkeleton from "./BoardCardSkeleton";

/** The summary and its four stage tiles, then stages with a lane and cards, so nothing moves when the board arrives. */
export default function DashboardSkeleton() {
  const { spacing, radius } = useTheme();
  return (
    <View accessible accessibilityLabel={MESSAGES.loading} accessibilityRole="progressbar" testID="dashboard-skeleton">
      <View style={{ gap: spacing.md, padding: spacing.lg }} testID="dashboard-summary-skeleton">
        <View style={{ gap: spacing.xs }}>
          <Skeleton height={HEIGHTS.summaryTitle} width="30%" />
          <Skeleton height={HEIGHTS.summaryCount} width="55%" />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {KANBAN_COLUMN_ORDER.map((column) => (
            <View key={column} style={{ flexBasis: STAGE_TILE_BASIS, flexGrow: 1 }} testID="stage-tile-skeleton">
              <Skeleton borderRadius={radius.md} height={HEIGHTS.stageTile} />
            </View>
          ))}
        </View>
      </View>
      {DASHBOARD_SKELETON_STAGES.map((stage) => (
        <View key={stage} testID="stage-skeleton">
          {/* The same box as StageHeader's, padding included, so the stages don't shift. */}
          <View style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
            <Skeleton height={HEIGHTS.stageTitle} width="40%" />
          </View>
          <View style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", paddingHorizontal: spacing.lg }}>
            <Skeleton height={HEIGHTS.laneTitle} width="30%" />
          </View>
          {DASHBOARD_SKELETON_CARDS.map((card) => (
            <BoardCardSkeleton key={card} />
          ))}
        </View>
      ))}
    </View>
  );
}
