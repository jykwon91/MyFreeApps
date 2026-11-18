import { LISTING_STATUS_LABELS, LISTING_STATUSES } from "@mybookkeeper/api-client/constants/listingLabels";
import { useListingsPages } from "@mybookkeeper/api-client/hooks/useListingsPages";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import type { ListingStatus } from "@mybookkeeper/api-client/types/listing/listing-status";
import { EmptyState, LoadingButton, OptionSheet, StaleDataBanner, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { ALL_STATUSES_OPTION, LISTING_MESSAGES } from "../../constants/listings";
import { canLoadMore } from "../../lib/canLoadMore";
import { hasCurrentPages } from "../../lib/hasCurrentPages";
import { useCanWrite } from "../workspace/useCanWrite";
import PagedListFooter from "../shell/PagedListFooter";
import { noListingsWithStatus, statusFilterLabel } from "./listingDisplay";
import ListingRow from "./ListingRow";
import ListingSkeletonRow from "./ListingSkeletonRow";
import ListingsSkeleton from "./ListingsSkeleton";

const STATUS_OPTIONS = [
  { value: ALL_STATUSES_OPTION, label: LISTING_MESSAGES.allStatuses },
  ...LISTING_STATUSES.map((status) => ({ value: status as string, label: LISTING_STATUS_LABELS[status] })),
];

export default function ListingsScreen() {
  const { spacing } = useTheme();
  const canWrite = useCanWrite();
  const [status, setStatus] = useState<ListingStatus | null>(null);
  const [isStatusSheetOpen, setIsStatusSheetOpen] = useState(false);

  const args = useMemo(() => (status ? { status } : {}), [status]);
  const list = useListingsPages(args);
  const { data: properties = [] } = useGetPropertiesQuery();
  const { refresh, refreshControl } = useRefresh(list.refetch, list.error);
  const isCurrent = hasCurrentPages(list);
  const rows = isCurrent ? list.listings : [];

  const addListing = () => router.push("/listings/new");

  const emptyList = !isCurrent && list.isFetching ? (
    <ListingsSkeleton />
  ) : list.error ? (
    <EmptyState
      action={{ label: LISTING_MESSAGES.tryAgain, onPress: refresh }}
      body={LISTING_MESSAGES.tryAgainOffer}
      heading={LISTING_MESSAGES.couldntLoadList}
    />
  ) : status ? (
    <EmptyState
      action={{ label: LISTING_MESSAGES.clearFilter, onPress: () => setStatus(null) }}
      body={LISTING_MESSAGES.tryAnotherStatus}
      heading={noListingsWithStatus(status)}
    />
  ) : (
    <EmptyState
      action={canWrite ? { label: LISTING_MESSAGES.add, onPress: addListing } : undefined}
      body={canWrite ? LISTING_MESSAGES.noneBody : LISTING_MESSAGES.noneViewOnlyBody}
      heading={LISTING_MESSAGES.noneHeading}
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
            loadingLabel={LISTING_MESSAGES.loadingMore}
            onRetry={list.loadMore}
            skeletonRow={<ListingSkeletonRow />}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            <StaleDataBanner isShown={Boolean(list.error && rows.length > 0 && !list.isLoadMoreError)} />
            {canWrite && rows.length > 0 ? <LoadingButton onPress={addListing}>{LISTING_MESSAGES.add}</LoadingButton> : null}
            <LoadingButton onPress={() => setIsStatusSheetOpen(true)} variant="secondary">
              {statusFilterLabel(status)}
            </LoadingButton>
          </View>
        }
        contentInsetAdjustmentBehavior="automatic"
        data={rows}
        keyExtractor={(listing) => listing.id}
        onEndReached={() => {
          if (canLoadMore(list)) list.loadMore();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={refreshControl}
        testID="listings-list"
        renderItem={({ item }) => (
          <ListingRow
            listing={item}
            onPress={() => router.push(`/listings/${item.id}`)}
            propertyName={properties.find((property) => property.id === item.property_id)?.name ?? null}
          />
        )}
      />
      <OptionSheet
        isOpen={isStatusSheetOpen}
        onClose={() => setIsStatusSheetOpen(false)}
        onSelect={(next) => {
          setIsStatusSheetOpen(false);
          setStatus(next === ALL_STATUSES_OPTION ? null : (next as ListingStatus));
        }}
        options={STATUS_OPTIONS}
        title={LISTING_MESSAGES.chooseStatus}
        value={status ?? ALL_STATUSES_OPTION}
      />
    </View>
  );
}
