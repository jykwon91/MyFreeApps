import { useUtilityPlansPages } from "@mybookkeeper/api-client/hooks/useUtilityPlansPages";
import { useGetUtilityPlansQuery } from "@mybookkeeper/api-client/store/utilityPlansApi";
import { EmptyState, LoadingButton, StaleDataBanner, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { UTILITY_PLAN_MESSAGES as MESSAGES } from "../../constants/utilityPlans";
import { canLoadMore } from "../../lib/canLoadMore";
import { hasCurrentPages } from "../../lib/hasCurrentPages";
import { useTodayIso } from "../../lib/useTodayIso";
import type { UtilityPlanFilter } from "../../types/UtilityPlanFilter";
import PagedListFooter from "../shell/PagedListFooter";
import { useCanWrite } from "../workspace/useCanWrite";
import { sortedPlans } from "./utilityPlanDisplay";
import { NO_UTILITY_PLAN_FILTER, filterLabel, isNarrowed, pageArgsFor } from "./utilityPlanFilter";
import UtilityPlanFilterSheet from "./UtilityPlanFilterSheet";
import UtilityPlanRow from "./UtilityPlanRow";
import UtilityPlansGlance from "./UtilityPlansGlance";
import UtilityPlanSkeletonRow from "./UtilityPlanSkeletonRow";
import UtilityPlansSkeleton from "./UtilityPlansSkeleton";

export default function UtilityPlansScreen() {
  const { spacing } = useTheme();
  const canWrite = useCanWrite();
  const todayIso = useTodayIso();
  const [filter, setFilter] = useState<UtilityPlanFilter>(NO_UTILITY_PLAN_FILTER);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const args = useMemo(() => pageArgsFor(filter), [filter]);
  const list = useUtilityPlansPages(args);
  const narrowed = isNarrowed(filter);
  // A narrowed list can be empty while plans exist; the glance and Add go by whether there are any at all.
  const anyPlan = useGetUtilityPlansQuery({ limit: 1 }, { skip: !narrowed });
  const { refresh, refreshControl } = useRefresh(list.refetch, list.error);
  const isCurrent = hasCurrentPages(list);
  const rows = useMemo(() => sortedPlans(isCurrent ? list.plans : [], todayIso), [isCurrent, list.plans, todayIso]);
  const hasPlans = narrowed ? (anyPlan.data?.total ?? 0) > 0 : rows.length > 0;
  const addPlan = () => router.push("/utility-plans/new");

  const emptyList = !isCurrent && list.isFetching ? (
    <UtilityPlansSkeleton />
  ) : list.error ? (
    <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.tryAgainOffer} heading={MESSAGES.couldntLoadList} />
  ) : narrowed ? (
    <EmptyState
      action={{ label: MESSAGES.filterClear, onPress: () => setFilter(NO_UTILITY_PLAN_FILTER) }}
      body={filter.needsRenewing && filter.serviceType === null ? MESSAGES.noMatchesRenewing : MESSAGES.tryAnotherFilter}
      heading={MESSAGES.noMatches}
    />
  ) : (
    <EmptyState
      action={canWrite ? { label: MESSAGES.add, onPress: addPlan } : undefined}
      body={canWrite ? MESSAGES.noneBody : MESSAGES.noneViewOnlyBody}
      heading={MESSAGES.noneHeading}
    />
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ListEmptyComponent={emptyList}
        ListFooterComponent={
          <PagedListFooter
            isLoadingMore={list.isFetchingNextPage}
            loadMoreFailed={list.isLoadMoreError}
            loadingLabel={MESSAGES.loadingMore}
            onRetry={list.loadMore}
            skeletonRow={<UtilityPlanSkeletonRow />}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            <StaleDataBanner isShown={Boolean(list.error && rows.length > 0 && !list.isLoadMoreError)} />
            {canWrite && hasPlans ? <LoadingButton onPress={addPlan}>{MESSAGES.add}</LoadingButton> : null}
            <UtilityPlansGlance hasPlans={hasPlans} />
            <LoadingButton onPress={() => setIsFilterSheetOpen(true)} variant="secondary">
              {filterLabel(filter)}
            </LoadingButton>
          </View>
        }
        contentInsetAdjustmentBehavior="automatic"
        data={rows}
        keyExtractor={(plan) => plan.id}
        onEndReached={() => {
          if (canLoadMore(list)) list.loadMore();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={refreshControl}
        renderItem={({ item }) => <UtilityPlanRow onPress={() => router.push(`/utility-plans/${item.id}`)} plan={item} todayIso={todayIso} />}
        testID="utility-plans-list"
      />
      <UtilityPlanFilterSheet filter={filter} isOpen={isFilterSheetOpen} onChange={setFilter} onClose={() => setIsFilterSheetOpen(false)} />
    </View>
  );
}
