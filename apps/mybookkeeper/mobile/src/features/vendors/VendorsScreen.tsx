import { useVendorsPages } from "@mybookkeeper/api-client/hooks/useVendorsPages";
import type { VendorCategory } from "@mybookkeeper/api-client/types/vendor/vendor-category";
import { EmptyState, LoadingButton, StaleDataBanner, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { VENDOR_MESSAGES } from "../../constants/vendors";
import { canLoadMore } from "../../lib/canLoadMore";
import { hasCurrentPages } from "../../lib/hasCurrentPages";
import PagedListFooter from "../shell/PagedListFooter";
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

  const args = useMemo(() => ({ ...(category ? { category } : {}), ...(preferredOnly ? { preferred: true } : {}) }), [category, preferredOnly]);
  const list = useVendorsPages(args);
  const { refresh, refreshControl } = useRefresh(list.refetch, list.error);
  const isCurrent = hasCurrentPages(list);
  const rows = isCurrent ? list.vendors : [];
  const isFiltered = category !== null || preferredOnly;
  const addVendor = () => router.push("/vendors/new");

  function clearFilters(): void {
    setCategory(null);
    setPreferredOnly(false);
  }

  const emptyList = !isCurrent && list.isFetching ? (
    <VendorsSkeleton />
  ) : list.error ? (
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

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ListEmptyComponent={emptyList}
        ListFooterComponent={
          <PagedListFooter
            isLoadingMore={list.isFetchingNextPage}
            loadMoreFailed={list.isLoadMoreError}
            loadingLabel={VENDOR_MESSAGES.loadingMore}
            onRetry={list.loadMore}
            skeletonRow={<VendorSkeletonRow />}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            <StaleDataBanner isShown={Boolean(list.error && rows.length > 0 && !list.isLoadMoreError)} />
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
          if (canLoadMore(list)) list.loadMore();
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
