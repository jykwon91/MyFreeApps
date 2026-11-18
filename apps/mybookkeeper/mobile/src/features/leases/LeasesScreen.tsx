import { useSignedLeasesPages } from "@mybookkeeper/api-client/hooks/useSignedLeasesPages";
import { EmptyState, LoadingButton, SegmentedControl, StaleDataBanner, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { LEASE_IMPORT_MESSAGES } from "../../constants/leaseImport";
import { LEASE_FILTERS, LEASE_MESSAGES } from "../../constants/leases";
import { NEW_LEASE_MESSAGES } from "../../constants/newLease";
import { canLoadMore } from "../../lib/canLoadMore";
import { hasCurrentPages } from "../../lib/hasCurrentPages";
import type { LeaseFilter } from "../../types/LeaseFilter";
import ApplicantsSkeleton, { ApplicantSkeletonRow } from "../applicants/ApplicantsSkeleton";
import { templatesPath } from "../newLease/newLeaseFlow";
import PagedListFooter from "../shell/PagedListFooter";
import { useCanWrite } from "../workspace/useCanWrite";
import LeaseRow from "./LeaseRow";

export default function LeasesScreen() {
  const { spacing } = useTheme();
  const canWrite = useCanWrite();
  const [filter, setFilter] = useState<LeaseFilter>("current");
  const list = useSignedLeasesPages(filter === "all" ? {} : { group: filter });
  const { refresh, refreshControl } = useRefresh(list.refetch, list.error);
  const rows = hasCurrentPages(list) ? list.leases : [];

  function emptyList() {
    if (list.isFetching) return <ApplicantsSkeleton label={LEASE_MESSAGES.loading} />;
    if (list.error) {
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
      ListFooterComponent={
        <PagedListFooter
          isLoadingMore={list.isFetchingNextPage}
          loadMoreFailed={list.isLoadMoreError}
          loadingLabel={LEASE_MESSAGES.loadingMore}
          onRetry={list.loadMore}
          skeletonRow={<ApplicantSkeletonRow />}
        />
      }
      ListHeaderComponent={
        <View style={{ gap: spacing.md, padding: spacing.lg }}>
          <StaleDataBanner isShown={Boolean(list.error && rows.length > 0 && !list.isLoadMoreError)} />
          {canWrite ? <LoadingButton onPress={() => router.push(templatesPath())} variant="secondary">{NEW_LEASE_MESSAGES.newLease}</LoadingButton> : null}
          {canWrite ? <LoadingButton onPress={() => router.push("/leases/import")} variant="secondary">{LEASE_IMPORT_MESSAGES.importLease}</LoadingButton> : null}
          <SegmentedControl accessibilityLabel={LEASE_MESSAGES.filterLabel} onChange={setFilter} segments={LEASE_FILTERS} value={filter} />
        </View>
      }
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      keyExtractor={(lease) => lease.id}
      onEndReached={() => {
        if (canLoadMore(list)) list.loadMore();
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
