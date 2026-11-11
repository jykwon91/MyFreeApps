import { useTheme } from "@platform/mobile";
import { Text } from "react-native";
import { DASHBOARD_MESSAGES as MESSAGES } from "../../constants/dashboard";
import type { DashboardListRowProps } from "../../types/DashboardListRowProps";
import BoardCard from "./BoardCard";
import LaneHeader from "./LaneHeader";
import StageHeader from "./StageHeader";

/** One line of the board's list: a stage, a lane, a card, or a note that a lane has nothing in it. */
export default function DashboardListRow({ row, now, movingIds, onToggleClosed, onToggleLane, onOpen, onMove }: DashboardListRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const note = { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, fontSize: fontSize.sm, color: colors.mutedForeground };
  switch (row.kind) {
    case "stage":
      return <StageHeader column={row.column} count={row.count} isCollapsible={row.isCollapsible} isOpen={row.isOpen} onToggle={onToggleClosed} />;
    case "lane":
      return <LaneHeader count={row.count} isCollapsed={row.isCollapsed} lane={row.lane} onToggle={() => onToggleLane(row.lane)} />;
    case "card":
      return (
        <BoardCard
          isMoving={movingIds.has(row.item.id)}
          item={row.item}
          now={now}
          onMove={() => onMove(row.item, row.column)}
          onOpen={() => onOpen(row.item)}
        />
      );
    case "laneEmpty":
      return <Text style={note}>{MESSAGES.noneInLane}</Text>;
  }
}
