import { VENDOR_CATEGORIES, VENDOR_CATEGORY_LABELS } from "@mybookkeeper/api-client/constants/vendorLabels";
import { useListVendorPagesInfiniteQuery } from "@mybookkeeper/api-client/store/vendorsApi";
import type { VendorCategory } from "@mybookkeeper/api-client/types/vendor/vendor-category";
import { Banner, EmptyState, LoadingButton, OptionSheet, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { ALL_CATEGORIES_OPTION, VENDOR_MESSAGES } from "../../constants/vendors";
import { uniqueById } from "../../lib/uniqueById";
import { useOpenLink } from "../inquiries/useOpenLink";
import LoadMoreFailed from "../shell/LoadMoreFailed";
import { categoryFilterLabel, noVendorsInCategory } from "./vendorDisplay";
import VendorRow from "./VendorRow";
import VendorSkeletonRow from "./VendorSkeletonRow";
import VendorsSkeleton from "./VendorsSkeleton";

const CATEGORY_OPTIONS = [
  { value: ALL_CATEGORIES_OPTION, label: VENDOR_MESSAGES.allCategories },
  ...VENDOR_CATEGORIES.map((category) => ({ value: category as string, label: VENDOR_CATEGORY_LABELS[category] })),
];

export default function VendorsScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const [category, setCategory] = useState<VendorCategory | null>(null);
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false);
  const [listThatFailedToLoadMore, setListThatFailedToLoadMore] = useState<string | null>(null);

  const args = useMemo(() => (category ? { category } : {}), [category]);
  const { currentData, error, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, refetch } = useListVendorPagesInfiniteQuery(args);
  const listKey = JSON.stringify(args);
  const loadMoreFailed = listThatFailedToLoadMore === listKey;
  const { refresh, refreshControl } = useRefresh(async () => {
    setListThatFailedToLoadMore(null);
    await refetch();
  }, error);
  const rows = useMemo(() => uniqueById(currentData?.pages.flatMap((page) => page.items) ?? []), [currentData]);
  const openWebsite = () => void openLink(`${WEB_BASE_URL}/vendors`);

  async function loadMore(): Promise<void> {
    const result = await fetchNextPage();
    setListThatFailedToLoadMore(result.isError ? listKey : null);
  }

  const emptyList = isFetching ? (
    <VendorsSkeleton />
  ) : error ? (
    <EmptyState
      action={{ label: VENDOR_MESSAGES.tryAgain, onPress: refresh }}
      body={VENDOR_MESSAGES.tryAgainOffer}
      heading={VENDOR_MESSAGES.couldntLoadList}
    />
  ) : category ? (
    <EmptyState
      action={{ label: VENDOR_MESSAGES.clearFilter, onPress: () => setCategory(null) }}
      body={VENDOR_MESSAGES.tryAnotherCategory}
      heading={noVendorsInCategory(category)}
    />
  ) : (
    <EmptyState
      action={{ label: VENDOR_MESSAGES.openWebsite, onPress: openWebsite }}
      body={VENDOR_MESSAGES.noneBody}
      heading={VENDOR_MESSAGES.noneHeading}
    />
  );

  const footer = isFetchingNextPage ? (
    <View accessible accessibilityLabel={VENDOR_MESSAGES.loadingMore} accessibilityRole="progressbar">
      <VendorSkeletonRow />
    </View>
  ) : loadMoreFailed ? (
    <LoadMoreFailed onRetry={() => void loadMore()} />
  ) : rows.length > 0 && !hasNextPage ? (
    <View style={{ gap: spacing.sm, padding: spacing.lg }}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{VENDOR_MESSAGES.manageOnWebsite}</Text>
      <LoadingButton onPress={openWebsite} variant="ghost">
        {VENDOR_MESSAGES.openWebsite}
      </LoadingButton>
    </View>
  ) : undefined;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ListEmptyComponent={emptyList}
        ListFooterComponent={footer}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            {error && rows.length > 0 && !loadMoreFailed ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
            <LoadingButton onPress={() => setIsCategorySheetOpen(true)} variant="secondary">
              {categoryFilterLabel(category)}
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
      <OptionSheet
        isOpen={isCategorySheetOpen}
        onClose={() => setIsCategorySheetOpen(false)}
        onSelect={(next) => {
          setIsCategorySheetOpen(false);
          setCategory(next === ALL_CATEGORIES_OPTION ? null : (next as VendorCategory));
        }}
        options={CATEGORY_OPTIONS}
        title={VENDOR_MESSAGES.chooseCategory}
        value={category ?? ALL_CATEGORIES_OPTION}
      />
    </View>
  );
}
