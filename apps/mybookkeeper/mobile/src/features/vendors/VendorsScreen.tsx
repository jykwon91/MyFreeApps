import { useListVendorPagesInfiniteQuery } from "@mybookkeeper/api-client/store/vendorsApi";
import type { VendorCategory } from "@mybookkeeper/api-client/types/vendor/vendor-category";
import { Banner, EmptyState, LoadingButton, SHOWING_LAST_LOADED_MESSAGE, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { VENDOR_MESSAGES } from "../../constants/vendors";
import { uniqueById } from "../../lib/uniqueById";
import LoadMoreFailed from "../shell/LoadMoreFailed";
import { useCanWrite } from "../workspace/useCanWrite";
import { vendorFilterLabel } from "./vendorDisplay";
import VendorFilterSheet from "./VendorFilterSheet";
import VendorRow from "./VendorRow";
import VendorSkeletonRow from "./VendorSkeletonRow";
import VendorsSkeleton from "./VendorsSkeleton";

export default function VendorsScreen() {
  const { spacing } = useTheme();
  const canWrite = useCanWrite();
  const [category, setCategory] = useState<VendorCategory | null>(null);
  const [preferredOnly, setPreferredOnly] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [listThatFailedToLoadMore, setListThatFailedToLoadMore] = useState<string | null>(null);

  const args = useMemo(() => ({ ...(category ? { category } : {}), ...(preferredOnly ? { preferred: true } : {}) }), [category, preferredOnly]);
  const { currentData, error, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, refetch } = useListVendorPagesInfiniteQuery(args);
  const listKey = JSON.stringify(args);
  const loadMoreFailed = listThatFailedToLoadMore === listKey;
  const { refresh, refreshControl } = useRefresh(async () => {
    setListThatFailedToLoadMore(null);
    await refetch();
  }, error);
  const rows = useMemo(() => uniqueById(currentData?.pages.flatMap((page) => page.items) ?? []), [currentData]);
  const isFiltered = category !== null || preferredOnly;
  const addVendor = () => router.push("/vendors/new");

  function clearFilters(): void {
    setCategory(null);
    setPreferredOnly(false);
  }

  async function loadMore(): Promise<void> {
    const result = await fetchNextPage();
    setListThatFailedToLoadMore(result.isError ? listKey : null);
  }

  const emptyList = !currentData && isFetching ? (
    <VendorsSkeleton />
  ) : error ? (
    <EmptyState
      action={{ label: VENDOR_MESSAGES.tryAgain, onPress: refresh }}
      body={VENDOR_MESSAGES.tryAgainOffer}
      heading={VENDOR_MESSAGES.couldntLoadList}
    />
  ) : isFiltered ? (
    <EmptyState action={{ label: VENDOR_MESSAGES.clearFilters, onPress: clearFilters }} body={VENDOR_MESSAGES.tryAnotherFilter} heading={VENDOR_MESSAGES.noMatches} />
  ) : (
    <EmptyState
      action={canWrite ? { label: VENDOR_MESSAGES.add, onPress: addVendor } : undefined}
      body={canWrite ? VENDOR_MESSAGES.noneBody : VENDOR_MESSAGES.noneViewOnlyBody}
      heading={VENDOR_MESSAGES.noneHeading}
    />
  );

  const footer = isFetchingNextPage ? (
    <View accessible accessibilityLabel={VENDOR_MESSAGES.loadingMore} accessibilityRole="progressbar">
      <VendorSkeletonRow />
    </View>
  ) : loadMoreFailed ? (
    <LoadMoreFailed onRetry={() => void loadMore()} />
  ) : undefined;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ListEmptyComponent={emptyList}
        ListFooterComponent={footer}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            {error && rows.length > 0 && !loadMoreFailed ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
            {canWrite && rows.length > 0 ? <LoadingButton onPress={addVendor}>{VENDOR_MESSAGES.add}</LoadingButton> : null}
            <LoadingButton onPress={() => setIsFilterSheetOpen(true)} variant="secondary">
              {vendorFilterLabel(category, preferredOnly)}
            </LoadingButton>
          </View>
        }
        contentInsetAdjustmentBehavior="automatic"
        data={rows}
        keyExtractor={(vendor) => vendor.id}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage && !loadMoreFailed) void loadMore();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={refreshControl}
        renderItem={({ item }) => <VendorRow onPress={() => router.push(`/vendors/${item.id}`)} vendor={item} />}
        testID="vendors-list"
      />
      <VendorFilterSheet
        category={category}
        isOpen={isFilterSheetOpen}
        onCategoryChange={setCategory}
        onClose={() => setIsFilterSheetOpen(false)}
        onPreferredChange={setPreferredOnly}
        preferredOnly={preferredOnly}
      />
    </View>
  );
}
