import type { KanbanColumn } from "@myjobhunter/api-client/types/kanban/kanban-column";
import { useReduceMotion } from "@platform/mobile";
import { useEffect, useRef, useState } from "react";
import type { FlatList, LayoutChangeEvent } from "react-native";
import { STAGE_SCROLL_RETRY_LIMIT, STAGE_SCROLL_RETRY_MS } from "../../constants/dashboard";
import { stageRowIndex } from "../../lib/dashboardRows";
import type { DashboardRow } from "../../types/DashboardRow";
import type { StageScrollRequest } from "../../types/StageScrollRequest";

/**
 * Scrolls the board to a stage's heading. It waits for the rows to update first, so
 * Closed has opened before the list scrolls to it. The rows have no fixed sizes, so if
 * the list hasn't drawn that far yet, it jumps near the heading (past the summary) and
 * tries again once those rows are drawn.
 */
export function useStageScroll(rows: readonly DashboardRow[]) {
  const list = useRef<FlatList<DashboardRow>>(null);
  const reduceMotion = useReduceMotion();
  const [request, setRequest] = useState<StageScrollRequest | null>(null);
  const handled = useRef<StageScrollRequest | null>(null);
  const headerHeight = useRef(0);
  const retries = useRef(0);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animated = reduceMotion === false;

  function cancelRetry(): void {
    if (retry.current !== null) clearTimeout(retry.current);
    retry.current = null;
  }

  useEffect(() => cancelRetry, []);

  useEffect(() => {
    if (request === null || handled.current === request) return;
    handled.current = request;
    retries.current = 0;
    cancelRetry();
    list.current?.scrollToIndex({ index: stageRowIndex(rows, request.column), viewPosition: 0, animated });
  }, [request, rows, animated]);

  function scrollToStage(column: KanbanColumn): void {
    setRequest({ column });
  }

  function onScrollToIndexFailed({ index, averageItemLength }: { index: number; averageItemLength: number }): void {
    if (retries.current >= STAGE_SCROLL_RETRY_LIMIT) return;
    retries.current += 1;
    list.current?.scrollToOffset({ offset: headerHeight.current + index * averageItemLength, animated: false });
    cancelRetry();
    retry.current = setTimeout(() => {
      retry.current = null;
      list.current?.scrollToIndex({ index, viewPosition: 0, animated });
    }, STAGE_SCROLL_RETRY_MS);
  }

  function onHeaderLayout(event: LayoutChangeEvent): void {
    headerHeight.current = event.nativeEvent.layout.height;
  }

  return { list, scrollToStage, onScrollToIndexFailed, onHeaderLayout };
}
