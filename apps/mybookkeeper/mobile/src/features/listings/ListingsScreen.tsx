import { LISTING_STATUS_LABELS, LISTING_STATUSES } from "@mybookkeeper/api-client/constants/listingLabels";
import { useListListingPagesInfiniteQuery } from "@mybookkeeper/api-client/store/listingsApi";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import type { ListingStatus } from "@mybookkeeper/api-client/types/listing/listing-status";
import { Banner, EmptyState, LoadingButton, OptionSheet, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { ALL_STATUSES_OPTION, LISTING_MESSAGES } from "../../constants/listings";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { uniqueById } from "../../lib/uniqueById";
import { useOpenLink } from "../inquiries/useOpenLink";
import LoadMoreFailed from "../shell/LoadMoreFailed";
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
  const openLink = useOpenLink();
  const [status, setStatus] = useState<ListingStatus | null>(null);
  const [isStatusSheetOpen, setIsStatusSheetOpen] = useState(false);
  const [listThatFailedToLoadMore, setListThatFailedToLoadMore] = useState<string | null>(null);

  const args = useMemo(() => (status ? { status } : {}), [status]);
  const { currentData, error, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, refetch } = useListListingPagesInfiniteQuery(args);
  const { data: properties = [] } = useGetPropertiesQuery();
  const listKey = JSON.stringify(args);
  const loadMoreFailed = listThatFailedToLoadMore === listKey;
  const { refresh, refreshControl } = useRefresh(async () => {
    setListThatFailedToLoadMore(null);
    await refetch();
  }, error);
  const rows = useMemo(() => uniqueById(currentData?.pages.flatMap((page) => page.items) ?? []), [currentData]);

  async function loadMore(): Promise<void> {
    const result = await fetchNextPage();
    setListThatFailedToLoadMore(result.isError ? listKey : null);
  }

  const emptyList = !currentData && isFetching ? (
    <ListingsSkeleton />
  ) : error ? (
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
      action={{ label: LISTING_MESSAGES.openWebsite, onPress: () => void openLink(`${WEB_BASE_URL}/listings`) }}
      body={LISTING_MESSAGES.noneBody}
      heading={LISTING_MESSAGES.noneHeading}
    />
  );

  const footer = isFetchingNextPage ? (
    <View accessible accessibilityLabel={LISTING_MESSAGES.loadingMore} accessibilityRole="progressbar">
      <ListingSkeletonRow />
    </View>
  ) : loadMoreFailed ? <LoadMoreFailed onRetry={() => void loadMore()} /> : undefined;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ListEmptyComponent={emptyList}
        ListFooterComponent={footer}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            {error && rows.length > 0 && !loadMoreFailed ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
            <LoadingButton onPress={() => setIsStatusSheetOpen(true)} variant="secondary">
              {statusFilterLabel(status)}
            </LoadingButton>
          </View>
        }
        contentInsetAdjustmentBehavior="automatic"
        data={rows}
        keyExtractor={(listing) => listing.id}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage && !loadMoreFailed) void loadMore();
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
