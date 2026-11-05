import { useListSignedLeasePagesInfiniteQuery } from "@mybookkeeper/api-client/store/signedLeasesApi";
import { Banner, EmptyState, LoadingButton, SegmentedControl, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { LEASE_FILTERS, LEASE_MESSAGES } from "../../constants/leases";
import { NEW_LEASE_MESSAGES } from "../../constants/newLease";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { uniqueById } from "../../lib/uniqueById";
import type { LeaseFilter } from "../../types/LeaseFilter";
import ApplicantsSkeleton, { ApplicantSkeletonRow } from "../applicants/ApplicantsSkeleton";
import { templatesPath } from "../newLease/newLeaseFlow";
import LoadMoreFailed from "../shell/LoadMoreFailed";
import { useCanWrite } from "../workspace/useCanWrite";
import LeaseRow from "./LeaseRow";

export default function LeasesScreen() {
  const { spacing } = useTheme();
  const canWrite = useCanWrite();
  const [filter, setFilter] = useState<LeaseFilter>("current");
  const [filterThatFailedToLoadMore, setFilterThatFailedToLoadMore] = useState<LeaseFilter | null>(null);
  const { currentData, error, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, refetch } =
    useListSignedLeasePagesInfiniteQuery(filter === "all" ? {} : { group: filter });
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

  function emptyList() {
    if (isFetching) return <ApplicantsSkeleton label={LEASE_MESSAGES.loading} />;
    if (error) {
      return (
        <EmptyState
          action={{ label: LEASE_MESSAGES.tryAgain, onPress: refresh }}
          body={LEASE_MESSAGES.checkConnection}
          heading={LEASE_MESSAGES.couldntLoad}
        />
      );
    }
    if (filter === "all") {
      return (
        <EmptyState
          action={canWrite ? { label: NEW_LEASE_MESSAGES.newLease, onPress: () => router.push(templatesPath()) } : undefined}
          body={canWrite ? LEASE_MESSAGES.noneBody : LEASE_MESSAGES.noneBodyViewer}
          heading={LEASE_MESSAGES.noneHeading}
        />
      );
    }
    return (
      <EmptyState
        action={{ label: LEASE_MESSAGES.seeAll, onPress: () => setFilter("all") }}
        body={filter === "current" ? LEASE_MESSAGES.noCurrentBody : LEASE_MESSAGES.noEndedBody}
        heading={filter === "current" ? LEASE_MESSAGES.noCurrentHeading : LEASE_MESSAGES.noEndedHeading}
      />
    );
  }

  return (
    <FlatList
      ListEmptyComponent={emptyList()}
      ListFooterComponent={isFetchingNextPage ? <ApplicantSkeletonRow /> : loadMoreFailed ? <LoadMoreFailed onRetry={() => void loadMore()} /> : undefined}
      ListHeaderComponent={
        <View style={{ gap: spacing.md, padding: spacing.lg }}>
          {error && rows.length > 0 && !loadMoreFailed ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
          {canWrite ? <LoadingButton onPress={() => router.push(templatesPath())} variant="secondary">{NEW_LEASE_MESSAGES.newLease}</LoadingButton> : null}
          <SegmentedControl accessibilityLabel={LEASE_MESSAGES.filterLabel} onChange={setFilter} segments={LEASE_FILTERS} value={filter} />
        </View>
      }
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      keyExtractor={(lease) => lease.id}
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage && !loadMoreFailed) void loadMore();
      }}
      onEndReachedThreshold={0.5}
      refreshControl={refreshControl}
      renderItem={({ item }) => (
        <LeaseRow
          endsOn={item.ends_on}
          name={item.applicant_legal_name ?? LEASE_MESSAGES.unnamedTenant}
          onPress={() => router.push(`/leases/${item.id}`)}
          startsOn={item.starts_on}
          status={item.status}
        />
      )}
      style={{ flex: 1 }}
      testID="leases-list"
    />
  );
}
