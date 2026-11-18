import { useTenantsPages } from "@mybookkeeper/api-client/hooks/useTenantsPages";
import { localToday } from "@platform/core/utils/localToday";
import { EmptyState, SegmentedControl, StaleDataBanner, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { FlatList, View } from "react-native";
import { TENANT_FILTERS, TENANT_MESSAGES } from "../../constants/tenants";
import { canLoadMore } from "../../lib/canLoadMore";
import { hasCurrentPages } from "../../lib/hasCurrentPages";
import type { TenantFilter } from "../../types/TenantFilter";
import ApplicantsSkeleton, { ApplicantSkeletonRow } from "../applicants/ApplicantsSkeleton";
import PagedListFooter from "../shell/PagedListFooter";
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
  const list = useTenantsPages({ include_ended: filter === "everyone", today: localToday() });
  const { refresh, refreshControl } = useRefresh(list.refetch, list.error);
  const isCurrent = hasCurrentPages(list);
  const rows = isCurrent ? list.tenants : [];

  const emptyList = !isCurrent && list.isFetching ? (
    <ApplicantsSkeleton label={TENANT_MESSAGES.loading} />
  ) : list.error ? (
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
      ListFooterComponent={
        <PagedListFooter
          isLoadingMore={list.isFetchingNextPage}
          loadMoreFailed={list.isLoadMoreError}
          loadingLabel={TENANT_MESSAGES.loadingMore}
          onRetry={list.loadMore}
          skeletonRow={<ApplicantSkeletonRow />}
        />
      }
      ListHeaderComponent={
        <View style={{ gap: spacing.md, padding: spacing.lg }}>
          <StaleDataBanner isShown={Boolean(list.error && rows.length > 0 && !list.isLoadMoreError)} />
          <SegmentedControl accessibilityLabel={TENANT_MESSAGES.filterLabel} onChange={onFilterChange} segments={TENANT_FILTERS} value={filter} />
        </View>
      }
      data={rows}
      keyExtractor={(tenant) => tenant.id}
      onEndReached={() => {
        if (canLoadMore(list)) list.loadMore();
      }}
      onEndReachedThreshold={0.5}
      refreshControl={refreshControl}
      renderItem={({ item }) => <TenantRow onPress={() => router.push(`/applicants/${item.id}`)} tenant={item} />}
      style={{ flex: 1 }}
      testID="tenants-list"
    />
  );
}
