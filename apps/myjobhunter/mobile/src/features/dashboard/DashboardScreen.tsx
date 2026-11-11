import { useListApplicationsKanbanQuery } from "@myjobhunter/api-client/store/applicationsApi";
import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";
import { groupKanbanItems } from "@myjobhunter/api-client/utils/groupKanbanItems";
import { Banner, EmptyState, OptionSheet, SHOWING_LAST_LOADED_MESSAGE, useOpenWebsite, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { APPLICATION_DETAIL_MESSAGES } from "../../constants/applicationDetail";
import { ANALYZE_WEB_PATH, DASHBOARD_MESSAGES as MESSAGES } from "../../constants/dashboard";
import { STAGE_OPTIONS } from "../../constants/stageOptions";
import { dashboardRows } from "../../lib/dashboardRows";
import type { BoardMoveTarget } from "../../types/BoardMoveTarget";
import DashboardListRow from "./DashboardListRow";
import DashboardSkeleton from "./DashboardSkeleton";
import DashboardSummary from "./DashboardSummary";
import { useBoardMoves } from "./useBoardMoves";
import { useDashboardFolds } from "./useDashboardFolds";
import { useStageScroll } from "./useStageScroll";

/** The website's /dashboard: every application on a board by stage, to open or move to another stage. */
export default function DashboardScreen() {
  const { spacing } = useTheme();
  // Back in the foreground, the board reloads, so its stage ages are today's.
  const board = useListApplicationsKanbanQuery(undefined, { refetchOnFocus: true });
  const { isRefreshing, refresh, refreshControl } = useRefresh(board.refetch, board.error);
  const openWebsite = useOpenWebsite();
  const { movingIds, moveTo } = useBoardMoves();
  const { layout, toggleLane, setClosedOpen } = useDashboardFolds();
  const [moveTarget, setMoveTarget] = useState<BoardMoveTarget | null>(null);

  const items = board.data?.items;
  const itemsByColumn = useMemo(() => groupKanbanItems(items ?? []), [items]);
  const rows = useMemo(() => (layout === null ? [] : dashboardRows(itemsByColumn, layout)), [itemsByColumn, layout]);
  const { list, scrollToStage, onScrollToIndexFailed, onHeaderLayout } = useStageScroll(rows);
  const counts = useMemo(
    () => ({
      applied: itemsByColumn.applied.length,
      interviewing: itemsByColumn.interviewing.length,
      offer: itemsByColumn.offer.length,
      closed: itemsByColumn.closed.length,
    }),
    [itemsByColumn],
  );
  // Stage ages count from when the board last loaded, so they stay put between refreshes.
  const loadedAt = board.fulfilledTimeStamp ?? 0;
  const hasCards = layout !== null && items !== undefined && items.length > 0;
  const isStale = items !== undefined && board.isError;

  function showStage(column: KanbanColumn): void {
    // Closed is folded away until opened; tapping its tile opens it, and the scroll waits for it to open.
    if (column === "closed" && layout?.isClosedOpen === false) setClosedOpen(true);
    scrollToStage(column);
  }

  // The folds are read with the board, so it never opens one way and then jumps to another.
  const emptyList = board.isLoading || layout === null ? (
    <DashboardSkeleton />
  ) : items === undefined ? (
    <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh, isLoading: isRefreshing }} body={MESSAGES.tryAgainOffer} heading={MESSAGES.couldntLoad} />
  ) : (
    <EmptyState action={{ label: MESSAGES.analyze, onPress: () => openWebsite(WEB_BASE_URL, ANALYZE_WEB_PATH) }} body={MESSAGES.noneBody} heading={MESSAGES.noneHeading} />
  );

  const header = hasCards ? (
    <View onLayout={onHeaderLayout} testID="dashboard-header">
      <DashboardSummary counts={counts} isStale={isStale} onShowStage={showStage} total={items.length} />
    </View>
  ) : isStale ? (
    <View style={{ padding: spacing.lg }}>
      <Banner message={SHOWING_LAST_LOADED_MESSAGE} />
    </View>
  ) : undefined;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ListEmptyComponent={emptyList}
        ListFooterComponent={<View style={{ height: spacing.xl }} />}
        ListHeaderComponent={header}
        data={hasCards ? rows : []}
        keyExtractor={(row) => row.key}
        onScrollToIndexFailed={onScrollToIndexFailed}
        ref={list}
        refreshControl={refreshControl}
        renderItem={({ item: row }) => (
          <DashboardListRow
            movingIds={movingIds}
            now={loadedAt}
            onMove={(item, column) => setMoveTarget({ item, column })}
            onOpen={(item) => router.push(`/applications/${item.id}`)}
            onToggleClosed={() => setClosedOpen(layout?.isClosedOpen !== true)}
            onToggleLane={toggleLane}
            row={row}
          />
        )}
        testID="dashboard-list"
      />
      <OptionSheet
        description={moveTarget ? `${moveTarget.item.role_title}, ${moveTarget.item.company_name}` : undefined}
        isOpen={moveTarget !== null}
        onClose={() => setMoveTarget(null)}
        onSelect={(target) => {
          setMoveTarget(null);
          if (moveTarget) void moveTo(moveTarget.item, moveTarget.column, target);
        }}
        options={STAGE_OPTIONS}
        title={APPLICATION_DETAIL_MESSAGES.stageTitle}
        value={moveTarget?.column ?? "applied"}
      />
    </View>
  );
}
