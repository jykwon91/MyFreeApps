import { useListTenantPagesInfiniteQuery } from "@mybookkeeper/api-client/store/applicantsApi";
import { localToday } from "@mybookkeeper/api-client/utils/tenancyState";
import { Banner, EmptyState, SegmentedControl, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { TENANT_FILTERS, TENANT_MESSAGES } from "../../constants/tenants";
import { uniqueById } from "../../lib/uniqueById";
import type { TenantFilter } from "../../types/TenantFilter";
import ApplicantsSkeleton, { ApplicantSkeletonRow } from "../applicants/ApplicantsSkeleton";
import LoadMoreFailed from "../shell/LoadMoreFailed";
import TenantRow from "./TenantRow";

export default function TenantsScreen({
  filter,
  onFilterChange,
  onSeeApplicants,
}: {
  filter: TenantFilter;
  onFilterChange: (filter: TenantFilter) => void;
  onSeeApplicants: () => void;
}) {
  const { spacing } = useTheme();
  const [filterThatFailedToLoadMore, setFilterThatFailedToLoadMore] = useState<TenantFilter | null>(null);
  const { currentData, error, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, refetch } =
    useListTenantPagesInfiniteQuery({ include_ended: filter === "everyone", today: localToday() });
  const loadMoreFailed = filterThatFailedToLoadMore === filter;
  const { refresh, refreshControl } = useRefresh(async () => {
    setFilterThatFailedToLoadMore(null);
    await refetch();
  }, error);
  const rows = useMemo(() => uniqueById(currentData?.pages.flatMap((page) => page.items) ?? []), [currentData]);

  async function loadMore(): Promise<void> {
    const result = await fetchNextPage();
    setFilterThatFailedToLoadMore(result.isError ? filter : null);
  }

  const emptyList = isFetching ? (
    <ApplicantsSkeleton label={TENANT_MESSAGES.loading} />
  ) : error ? (
    <EmptyState action={{ label: TENANT_MESSAGES.tryAgain, onPress: refresh }} body={TENANT_MESSAGES.wantRetry} heading={TENANT_MESSAGES.couldntLoad} />
  ) : filter === "current" ? (
    <EmptyState
      action={{ label: TENANT_MESSAGES.seeEveryone, onPress: () => onFilterChange("everyone") }}
      body={TENANT_MESSAGES.noCurrentBody}
      heading={TENANT_MESSAGES.noCurrentHeading}
    />
  ) : (
    <EmptyState action={{ label: TENANT_MESSAGES.seeApplicants, onPress: onSeeApplicants }} body={TENANT_MESSAGES.noneBody} heading={TENANT_MESSAGES.noneHeading} />
  );

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListFooterComponent={isFetchingNextPage ? <ApplicantSkeletonRow /> : loadMoreFailed ? <LoadMoreFailed onRetry={() => void loadMore()} /> : undefined}
      ListHeaderComponent={
        <View style={{ gap: spacing.md, padding: spacing.lg }}>
          {error && rows.length > 0 && !loadMoreFailed ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
          <SegmentedControl accessibilityLabel={TENANT_MESSAGES.filterLabel} onChange={onFilterChange} segments={TENANT_FILTERS} value={filter} />
        </View>
      }
      data={rows}
      keyExtractor={(tenant) => tenant.id}
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage && !loadMoreFailed) void loadMore();
      }}
      onEndReachedThreshold={0.5}
      refreshControl={refreshControl}
      renderItem={({ item }) => <TenantRow onPress={() => router.push(`/applicants/${item.id}`)} tenant={item} />}
      style={{ flex: 1 }}
      testID="tenants-list"
    />
  );
}
