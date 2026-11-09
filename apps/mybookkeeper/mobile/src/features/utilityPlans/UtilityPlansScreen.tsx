import { useGetUtilityPlansQuery } from "@mybookkeeper/api-client/store/utilityPlansApi";
import { Banner, EmptyState, LoadingButton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { UTILITY_PLAN_LIST_LIMIT, UTILITY_PLAN_MESSAGES as MESSAGES } from "../../constants/utilityPlans";
import { useTodayIso } from "../../lib/useTodayIso";
import type { UtilityPlanFilter } from "../../types/UtilityPlanFilter";
import { useCanWrite } from "../workspace/useCanWrite";
import { sortedPlans } from "./utilityPlanDisplay";
import { NO_UTILITY_PLAN_FILTER, filterLabel, filteredPlans, isNarrowed } from "./utilityPlanFilter";
import UtilityPlanFilterSheet from "./UtilityPlanFilterSheet";
import UtilityPlanRow from "./UtilityPlanRow";
import UtilityPlansGlance from "./UtilityPlansGlance";
import UtilityPlansSkeleton from "./UtilityPlansSkeleton";

export default function UtilityPlansScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const todayIso = useTodayIso();
  const [filter, setFilter] = useState<UtilityPlanFilter>(NO_UTILITY_PLAN_FILTER);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const { currentData, error, isFetching, refetch } = useGetUtilityPlansQuery({ limit: UTILITY_PLAN_LIST_LIMIT });
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const allRows = useMemo(() => sortedPlans(currentData?.items ?? [], todayIso), [currentData, todayIso]);
  const rows = useMemo(() => filteredPlans(allRows, filter, todayIso), [allRows, filter, todayIso]);
  const addPlan = () => router.push("/utility-plans/new");

  const emptyList = !currentData && isFetching ? (
    <UtilityPlansSkeleton />
  ) : error ? (
    <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.tryAgainOffer} heading={MESSAGES.couldntLoadList} />
  ) : isNarrowed(filter) ? (
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
          currentData?.has_more && rows.length > 0 ? (
            <Text style={{ padding: spacing.lg, fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.showingFirst}</Text>
          ) : undefined
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            {error && allRows.length > 0 ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
            {canWrite && allRows.length > 0 ? <LoadingButton onPress={addPlan}>{MESSAGES.add}</LoadingButton> : null}
            <UtilityPlansGlance hasPlans={allRows.length > 0} />
            <LoadingButton onPress={() => setIsFilterSheetOpen(true)} variant="secondary">
              {filterLabel(filter)}
            </LoadingButton>
          </View>
        }
        contentInsetAdjustmentBehavior="automatic"
        data={rows}
        keyExtractor={(plan) => plan.id}
        refreshControl={refreshControl}
        renderItem={({ item }) => <UtilityPlanRow onPress={() => router.push(`/utility-plans/${item.id}`)} plan={item} todayIso={todayIso} />}
        testID="utility-plans-list"
      />
      <UtilityPlanFilterSheet filter={filter} isOpen={isFilterSheetOpen} onChange={setFilter} onClose={() => setIsFilterSheetOpen(false)} />
    </View>
  );
}
