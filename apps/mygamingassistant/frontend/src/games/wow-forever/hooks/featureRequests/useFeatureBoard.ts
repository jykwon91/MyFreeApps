import { useCallback, useMemo, useState } from "react";
import { useGetFeatureRequestsInfiniteQuery } from "@/games/wow-forever/api/wowFeatureRequestsApi";
import { listArgsFor } from "@/games/wow-forever/lib/featureRequests/boardParams";
import { stableOrder } from "@/games/wow-forever/lib/featureRequests/stableOrder";
import { useRefetchOnFocus } from "@/games/wow-forever/hooks/featureRequests/useRefetchOnFocus";
import type { BoardFilters } from "@/games/wow-forever/types/featureRequests/boardFilters";
import type { FeatureBoardState } from "@/games/wow-forever/types/featureRequests/featureBoardState";
import type { FeatureRequestListArgs } from "@/games/wow-forever/types/featureRequests/featureRequestListArgs";

interface ShownOrder {
  key: string;
  args: FeatureRequestListArgs;
  ids: string[];
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * The public board for `filters`, in a stable order: refetches (tab focus, a vote) update counts in place
 * and never move cards under the player's finger. While a new filter loads, the previous list stays up
 * (marked stale) instead of flashing to a skeleton.
 */
export function useFeatureBoard(filters: BoardFilters, clientId: string): FeatureBoardState {
  const listArgs = useMemo(() => listArgsFor(filters, clientId), [filters, clientId]);
  const key = useMemo(() => JSON.stringify(listArgs), [listArgs]);
  const query = useGetFeatureRequestsInfiniteQuery(listArgs);
  const [order, setOrder] = useState<ShownOrder>({ key, args: listArgs, ids: [] });

  const current = query.currentData;
  const shown = current ?? query.data;
  // Which filters the shown list belongs to: the old ones until the new list arrives.
  const showingOld = current === undefined;
  const shownKey = showingOld ? order.key : key;
  const shownArgs = showingOld ? order.args : listArgs;
  const pages = useMemo(() => shown?.pages ?? [], [shown]);
  const items = useMemo(() => pages.flatMap((p) => p.items), [pages]);
  const stories = useMemo(
    () => stableOrder(order.key === shownKey ? order.ids : [], items),
    [order, shownKey, items],
  );
  const storyIds = useMemo(() => stories.map((s) => s.id), [stories]);
  if (shown !== undefined && (order.key !== shownKey || !sameIds(order.ids, storyIds))) {
    setOrder({ key: shownKey, args: shownArgs, ids: storyIds });
  }

  const serverVotedIds = useMemo(() => new Set(pages.flatMap((p) => p.voted_story_ids)), [pages]);
  const { refetch } = query;
  const refetchBoard = useCallback(() => {
    void refetch();
  }, [refetch]);
  useRefetchOnFocus(refetchBoard, shown !== undefined);

  return {
    listArgs: shownArgs,
    stories,
    total: pages[0]?.total ?? 0,
    serverVotedIds,
    isLoading: shown === undefined && !query.isError,
    isError: query.isError && current === undefined,
    isStale: current === undefined && shown !== undefined && !query.isError,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => void query.fetchNextPage(),
    refetch: refetchBoard,
  };
}
