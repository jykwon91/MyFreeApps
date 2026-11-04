import LoadMoreFailed from "../shell/LoadMoreFailed";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { useListTransactionPagesInfiniteQuery } from "@mybookkeeper/api-client/store/transactionsApi";
import { Banner, EmptyState, LoadingButton, SearchField, SegmentedControl, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { NO_FILTERS, TRANSACTION_PERIODS, TRANSACTION_VIEWS, UNASSIGNED_PROPERTY } from "../../constants/transactionFilters";
import type { TransactionFilters } from "../../types/TransactionFilters";
import { useToday } from "../../lib/useToday";
import { useCanWrite } from "../workspace/useCanWrite";
import { categoryLabel, propertyLabel } from "./transactionDisplay";
import TransactionFilterSheet from "./TransactionFilterSheet";
import { activeFilterCount, reviewLink, toListParams } from "./transactionFilters";
import TransactionRow from "./TransactionRow";
import { useVendorSearch } from "./useVendorSearch";
import TransactionsSkeleton, { TransactionSkeletonRow } from "./TransactionsSkeleton";

export default function TransactionsScreen({
  filters,
  onFiltersChange,
  onVendorChange,
}: {
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
  onVendorChange: (vendor: string) => void;
}) {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const today = useToday();
  const { search, changeSearch, clearSearch } = useVendorSearch(filters.vendor, onVendorChange);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [listThatFailedToLoadMore, setListThatFailedToLoadMore] = useState<string | null>(null);

  const params = useMemo(() => toListParams(filters, today), [filters, today]);
  const {
    currentData,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useListTransactionPagesInfiniteQuery(params);
  const { data: properties = [] } = useGetPropertiesQuery();
  const listKey = JSON.stringify(params);
  const loadMoreFailed = listThatFailedToLoadMore === listKey;
  const { refresh, refreshControl } = useRefresh(async () => {
    setListThatFailedToLoadMore(null);
    await refetch();
  }, error);

  const propertyNames = useMemo(() => new Map(properties.map((property) => [property.id, property.name])), [properties]);
  const rows = useMemo(() => currentData?.pages.flat() ?? [], [currentData]);

  const filterCount = activeFilterCount(filters);
  const isNarrowed = filterCount > 0 || filters.vendor.trim() !== "";
  const summary = [
    filters.propertyId === UNASSIGNED_PROPERTY ? "No property" : filters.propertyId ? propertyLabel(filters.propertyId, properties) : null,
    filters.category ? categoryLabel(filters.category) : null,
    filters.type === "income" ? "Income" : filters.type === "expense" ? "Expenses" : null,
    filters.period !== "all" && filters.view !== "review"
      ? TRANSACTION_PERIODS.find((option) => option.value === filters.period)?.label
      : null,
    filters.approvedOnly && filters.view !== "review" ? "Approved" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  async function loadMore(): Promise<void> {
    const result = await fetchNextPage();
    setListThatFailedToLoadMore(result.isError ? listKey : null);
  }

  function clearNarrowing(): void {
    clearSearch();
    onFiltersChange({ ...NO_FILTERS, view: filters.view });
  }

  if (isLoading) return <TransactionsSkeleton />;
  if (rows.length === 0 && !isFetching && !error && !isNarrowed && filters.view === "all") {
    return (
      <EmptyState
        action={canWrite ? { label: "Take a photo", onPress: () => router.push("/camera") } : undefined}
        body={canWrite ? "Snap a receipt or invoice and I'll pull the transactions out for you." : "They'll show up here once someone adds a document."}
        heading="No transactions yet"
      />
    );
  }

  const emptyList = isFetching ? (
    <TransactionsSkeleton />
  ) : error ? (
    <EmptyState
      action={{ label: "Try again", onPress: refresh }}
      body="Want me to try again?"
      heading="I couldn't load your transactions."
    />
  ) : isNarrowed ? (
    <EmptyState
      action={{ label: "Clear filters", onPress: clearNarrowing }}
      body="Try a different search or clear the filters."
      heading="Nothing matches that"
    />
  ) : (
    <EmptyState body="Nothing is waiting for your review." heading="You're all caught up" />
  );

  const footer = isFetchingNextPage ? (
    <TransactionSkeletonRow />
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
            <SearchField
              accessibilityLabel="Search transactions by vendor"
              onChangeText={changeSearch}
              onClear={() => changeSearch("")}
              placeholder="Search by vendor"
              value={search}
            />
            <SegmentedControl
              accessibilityLabel="Which transactions to show"
              onChange={(view) => onFiltersChange({ ...filters, view })}
              segments={TRANSACTION_VIEWS}
              value={filters.view}
            />
            <LoadingButton
              accessibilityLabel={filterCount > 0 ? `Filters, ${filterCount} on` : "Filters"}
              onPress={() => setIsFilterSheetOpen(true)}
              variant="secondary"
            >
              {filterCount > 0 ? `Filters (${filterCount})` : "Filters"}
            </LoadingButton>
            {summary ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: fontSize.sm, color: colors.mutedForeground }}>
                  {summary}
                </Text>
                <LoadingButton onPress={clearNarrowing} variant="ghost">
                  Clear
                </LoadingButton>
              </View>
            ) : null}
          </View>
        }
        data={rows}
        keyExtractor={(transaction) => transaction.id}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage && !loadMoreFailed) void loadMore();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={refreshControl}
        renderItem={({ item }) => (
          <TransactionRow
            onPress={() => router.push(filters.view === "review" ? reviewLink(item.id, filters) : `/transactions/${item.id}`)}
            propertyName={item.property_id ? (propertyNames.get(item.property_id) ?? null) : null}
            transaction={item}
          />
        )}
        testID="transactions-list"
      />
      {isFilterSheetOpen ? (
        <TransactionFilterSheet
          filters={filters}
          onApply={(next) => {
            setIsFilterSheetOpen(false);
            onFiltersChange(next);
          }}
          onClose={() => setIsFilterSheetOpen(false)}
          properties={properties}
        />
      ) : null}
    </View>
  );
}
