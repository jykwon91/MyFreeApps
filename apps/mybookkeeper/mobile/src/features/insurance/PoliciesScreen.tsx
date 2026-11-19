import { useInsurancePoliciesPages } from "@mybookkeeper/api-client/hooks/useInsurancePoliciesPages";
import { EmptyState, StaleDataBanner, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList } from "react-native";
import { EXPIRING_FILTER_DAYS, INSURANCE_MESSAGES } from "../../constants/insurance";
import { canLoadMore } from "../../lib/canLoadMore";
import { hasCurrentPages } from "../../lib/hasCurrentPages";
import { addDays } from "../../lib/localDate";
import { useTodayIso } from "../../lib/useTodayIso";
import type { PolicyFilter } from "../../types/PolicyFilter";
import PagedListFooter from "../shell/PagedListFooter";
import { useCanWrite } from "../workspace/useCanWrite";
import PoliciesFilterSheet from "./PoliciesFilterSheet";
import PoliciesHeader from "./PoliciesHeader";
import PoliciesSkeleton, { PolicySkeletonRow } from "./PoliciesSkeleton";
import { sortedPolicies } from "./policyDisplay";
import PolicyRow from "./PolicyRow";

export default function PoliciesScreen() {
  const { spacing } = useTheme();
  const canWrite = useCanWrite();
  const todayIso = useTodayIso();
  const [filter, setFilter] = useState<PolicyFilter>("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const args = useMemo(() => (filter === "expiring" ? { expiring_before: addDays(todayIso, EXPIRING_FILTER_DAYS) } : {}), [filter, todayIso]);
  const list = useInsurancePoliciesPages(args);
  const { refresh, refreshControl } = useRefresh(list.refetch, list.error);
  const isCurrent = hasCurrentPages(list);
  const rows = useMemo(() => sortedPolicies(isCurrent ? list.policies : [], todayIso), [isCurrent, list.policies, todayIso]);

  const emptyList = !isCurrent && list.isFetching ? (
    <PoliciesSkeleton />
  ) : list.error ? (
    <EmptyState action={{ label: INSURANCE_MESSAGES.tryAgain, onPress: refresh }} body={INSURANCE_MESSAGES.tryAgainOffer} heading={INSURANCE_MESSAGES.couldntLoadList} />
  ) : filter === "expiring" ? (
    <EmptyState action={{ label: INSURANCE_MESSAGES.showAll, onPress: () => setFilter("all") }} body={INSURANCE_MESSAGES.noneExpiring} heading={INSURANCE_MESSAGES.noneExpiringHeading} />
  ) : (
    <EmptyState
      action={canWrite ? { label: INSURANCE_MESSAGES.addPolicy, onPress: () => router.push("/insurance/new") } : undefined}
      body={INSURANCE_MESSAGES.noneBody}
      heading={INSURANCE_MESSAGES.noneHeading}
    />
  );

  return (
    <>
      <FlatList
        ListEmptyComponent={emptyList}
        ListFooterComponent={
          <PagedListFooter
            isLoadingMore={list.isFetchingNextPage}
            loadMoreFailed={list.isLoadMoreError}
            loadingLabel={INSURANCE_MESSAGES.loadingMore}
            onRetry={list.loadMore}
            skeletonRow={<PolicySkeletonRow />}
          />
        }
        ListHeaderComponent={
          <>
            <PoliciesHeader canWrite={canWrite} filter={filter} onOpenFilter={() => setIsFilterOpen(true)} />
            <StaleDataBanner
              isShown={Boolean(list.error && rows.length > 0 && !list.isLoadMoreError)}
              style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md }}
            />
          </>
        }
        contentInsetAdjustmentBehavior="automatic"
        data={rows}
        keyExtractor={(policy) => policy.id}
        onEndReached={() => {
          if (canLoadMore(list)) list.loadMore();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={refreshControl}
        renderItem={({ item }) => <PolicyRow onPress={() => router.push(`/insurance/${item.id}`)} policy={item} todayIso={todayIso} />}
        testID="policies-list"
      />
      <PoliciesFilterSheet
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        onSelect={(next) => {
          setIsFilterOpen(false);
          setFilter(next);
        }}
        value={filter}
      />
    </>
  );
}
