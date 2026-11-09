import DuplicatesLink from "../duplicates/DuplicatesLink";
import LoadMoreFailed from "../shell/LoadMoreFailed";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { useListTransactionPagesInfiniteQuery } from "@mybookkeeper/api-client/store/transactionsApi";
import { Banner, EmptyState, LoadingButton, OptionSheet, SearchField, SegmentedControl, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { TRANSACTION_EXPORT_FORMATS, TRANSACTION_EXPORT_MESSAGES as EXPORT_MESSAGES } from "../../constants/transactionExport";
import { NO_FILTERS, TRANSACTION_PERIODS, TRANSACTION_VIEWS, UNASSIGNED_PROPERTY } from "../../constants/transactionFilters";
import type { TransactionFilters } from "../../types/TransactionFilters";
import { monthName } from "../../lib/localDate";
import { useToday } from "../../lib/useToday";
import { useCanWrite } from "../workspace/useCanWrite";
import { categoryLabel, customRangeLabel, propertyLabel } from "./transactionDisplay";
import BulkApproveBar from "./BulkApproveBar";
import { isBulkApprovable } from "./bulkApprovable";
import TransactionFilterSheet from "./TransactionFilterSheet";
import { activeFilterCount, reviewLink, toListParams } from "./transactionFilters";
import TransactionRow from "./TransactionRow";
import { notAppliedToExport } from "./transactionExport";
import { useBulkApprove } from "./useBulkApprove";
import { useShareTransactionExport } from "./useShareTransactionExport";
import { useTransactionSelection } from "./useTransactionSelection";
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
  const [isExportSheetOpen, setIsExportSheetOpen] = useState(false);
  const [listThatFailedToLoadMore, setListThatFailedToLoadMore] = useState<string | null>(null);

  const selection = useTransactionSelection();
  const bulk = useBulkApprove();

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
  const { data: properties = [], refetch: refetchProperties } = useGetPropertiesQuery();
  const { exportTransactions, isExporting } = useShareTransactionExport(() => refetchProperties().unwrap());
  const listKey = JSON.stringify(params);
  const loadMoreFailed = listThatFailedToLoadMore === listKey;
  const { refresh, refreshControl } = useRefresh(async () => {
    setListThatFailedToLoadMore(null);
    await refetch();
  }, error);

  // Ticks belong to the list they were made in.
  const { cancel: cancelSelection } = selection;
  useEffect(() => cancelSelection(), [listKey, cancelSelection]);

  const propertyNames = useMemo(() => new Map(properties.map((property) => [property.id, property.name])), [properties]);
  const rows = useMemo(() => currentData?.pages.flat() ?? [], [currentData]);

  const filterCount = activeFilterCount(filters);
  const isNarrowed = filterCount > 0 || filters.vendor.trim() !== "";
  const summary = [
    filters.propertyId === UNASSIGNED_PROPERTY ? "No property" : filters.propertyId ? propertyLabel(filters.propertyId, properties) : null,
    filters.category ? categoryLabel(filters.category) : null,
    filters.type === "income" ? "Income" : filters.type === "expense" ? "Expenses" : null,
    filters.view === "review"
      ? null
      : filters.month
        ? monthName(filters.month, "long")
        : filters.period === "custom" && filters.startDate && filters.endDate
          ? customRangeLabel(filters.startDate, filters.endDate)
          : filters.period !== "all"
            ? TRANSACTION_PERIODS.find((option) => option.value === filters.period)?.label
            : null,
    filters.approvedOnly && filters.view !== "review" ? "Approved" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const selectedRows = useMemo(() => rows.filter((row) => selection.selected?.has(row.id)), [rows, selection.selected]);
  const approvableIds = selectedRows.filter(isBulkApprovable).map((row) => row.id);

  async function approveSelected(): Promise<void> {
    if (await bulk.approve(approvableIds)) selection.cancel();
  }

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

  const emptyList = !currentData && isFetching ? (
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
            <DuplicatesLink />
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
            {canWrite && !selection.isSelecting ? (
              <LoadingButton accessibilityLabel="Add a transaction by hand" onPress={() => router.push("/transactions/new")}>
                Add transaction
              </LoadingButton>
            ) : null}
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <LoadingButton
                accessibilityLabel={filterCount > 0 ? `Filters, ${filterCount} on` : "Filters"}
                onPress={() => setIsFilterSheetOpen(true)}
                style={{ flex: 1 }}
                variant="secondary"
              >
                {filterCount > 0 ? `Filters (${filterCount})` : "Filters"}
              </LoadingButton>
              <LoadingButton
                accessibilityLabel="Export the transactions shown"
                isLoading={isExporting}
                loadingText={EXPORT_MESSAGES.exporting}
                onPress={() => setIsExportSheetOpen(true)}
                style={{ flex: 1 }}
                variant="secondary"
              >
                {EXPORT_MESSAGES.export}
              </LoadingButton>
              {canWrite && rows.length > 0 ? (
                selection.isSelecting ? (
                  <LoadingButton
                    accessibilityLabel="Select all the transactions shown"
                    onPress={() => selection.selectAll(rows.map((row) => row.id))}
                    style={{ flex: 1 }}
                    variant="secondary"
                  >
                    Select all
                  </LoadingButton>
                ) : (
                  <LoadingButton accessibilityLabel="Select several transactions" onPress={() => selection.start()} style={{ flex: 1 }} variant="secondary">
                    Select
                  </LoadingButton>
                )
              ) : null}
            </View>
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
        extraData={selection.selected}
        keyExtractor={(transaction) => transaction.id}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage && !loadMoreFailed) void loadMore();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={refreshControl}
        renderItem={({ item }) => (
          <TransactionRow
            isSelected={selection.selected ? selection.selected.has(item.id) : undefined}
            onLongPress={canWrite ? () => selection.start(item.id) : undefined}
            onPress={() => {
              if (selection.isSelecting) selection.toggle(item.id);
              else router.push(filters.view === "review" ? reviewLink(item.id, filters) : `/transactions/${item.id}`);
            }}
            propertyName={item.property_id ? (propertyNames.get(item.property_id) ?? null) : null}
            transaction={item}
          />
        )}
        testID="transactions-list"
      />
      {selection.isSelecting ? (
        <BulkApproveBar
          approvableCount={approvableIds.length}
          isApproving={bulk.isApproving}
          onApprove={approveSelected}
          onCancel={selection.cancel}
          selectedCount={selectedRows.length}
        />
      ) : null}
      <OptionSheet
        description={[EXPORT_MESSAGES.description, notAppliedToExport(params)].filter(Boolean).join(" ")}
        isOpen={isExportSheetOpen}
        onClose={() => setIsExportSheetOpen(false)}
        onSelect={(format) => {
          setIsExportSheetOpen(false);
          void exportTransactions(format, params);
        }}
        options={TRANSACTION_EXPORT_FORMATS}
        title={EXPORT_MESSAGES.title}
        value={null}
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
