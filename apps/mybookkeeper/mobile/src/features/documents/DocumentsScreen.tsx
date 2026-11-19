import { DEFAULT_DOCUMENT_VIEW } from "@mybookkeeper/api-client/constants/documentListView";
import type { Document } from "@mybookkeeper/api-client/types/document/document";
import type { DocumentListView } from "@mybookkeeper/api-client/types/document/DocumentListView";
import type { DocumentPageArgs } from "@mybookkeeper/api-client/types/document/DocumentPageArgs";
import { activeDocumentFilterCount, isDefaultDocumentView } from "@mybookkeeper/api-client/utils/documentListView";
import { useDebouncedValue } from "@platform/core/hooks/useDebouncedValue";
import { EmptyState, LoadingButton, SearchField, SegmentedControl, StaleDataBanner, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, type ListRenderItem, Text, View } from "react-native";
import { DOCUMENT_BULK_MESSAGES, hiddenSelectedNote } from "../../constants/documentBulk";
import { DOCUMENT_FILTERS } from "../../constants/documentFilters";
import { DOCUMENT_LIST_MESSAGES, documentCountLabel, filtersAccessibilityLabel, filtersButtonLabel, STILL_READING_MESSAGE } from "../../constants/documents";
import { SEARCH_DEBOUNCE_MS } from "../../constants/transactionFilters";
import { canLoadMore } from "../../lib/canLoadMore";
import { hasCurrentPages } from "../../lib/hasCurrentPages";
import { useRowsRefreshCount } from "../../lib/useRowsRefreshCount";
import type { DocumentFilter } from "../../types/DocumentFilter";
import UploadStatus from "../capture/UploadStatus";
import PagedListFooter from "../shell/PagedListFooter";
import { useCanWrite } from "../workspace/useCanWrite";
import { isActionable } from "./documentDisplay";
import DocumentBulkBar from "./DocumentBulkBar";
import DocumentFilterSheet from "./DocumentFilterSheet";
import DocumentRow from "./DocumentRow";
import DocumentSelectionHeader from "./DocumentSelectionHeader";
import DocumentSkeletonRow from "./DocumentSkeletonRow";
import DocumentsSkeleton from "./DocumentsSkeleton";
import FailedDocumentsNotice from "./FailedDocumentsNotice";
import { useBulkDeleteDocuments } from "./useBulkDeleteDocuments";
import { useDocumentSelection } from "./useDocumentSelection";
import { useDocumentsWithPolling } from "./useDocumentsWithPolling";

export default function DocumentsScreen({
  filter,
  onFilterChange,
}: {
  filter: DocumentFilter;
  onFilterChange: (filter: DocumentFilter) => void;
}) {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  // The search box shows what was typed; only the debounced term narrows the list, so a keystroke doesn't re-sort every document.
  const [searchText, setSearchText] = useState(DEFAULT_DOCUMENT_VIEW.search);
  const [options, setOptions] = useState<Omit<DocumentListView, "search">>(DEFAULT_DOCUMENT_VIEW);
  // Clearing the box shows the full list right away; only typing waits.
  const debouncedSearch = useDebouncedValue(searchText, searchText === "" ? 0 : SEARCH_DEBOUNCE_MS);
  const appliedSearch = searchText === "" ? "" : debouncedSearch;
  const view = useMemo<DocumentListView>(() => ({ ...options, search: searchText }), [options, searchText]);
  const appliedView = useMemo<DocumentListView>(() => ({ ...options, search: appliedSearch }), [options, appliedSearch]);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isFailedNoticeDismissed, setIsFailedNoticeDismissed] = useState(false);
  // Search, filters, order and the "needs a look" segment are all applied by the server, a page at a time.
  const args = useMemo<DocumentPageArgs>(() => ({ ...appliedView, needsReview: filter === "needsALook" }), [appliedView, filter]);

  const { list, summary, failed, gaveUp } = useDocumentsWithPolling(args);
  const { refresh, refreshControl } = useRefresh(() => Promise.all([list.refetch(), summary.refetch()]), list.error);
  const isCurrent = hasCurrentPages(list);
  const rows = isCurrent ? list.documents : [];
  const rowsVersion = useRowsRefreshCount(JSON.stringify(args), list.documents);
  const rowsStatus = useMemo(() => ({ isCurrent, version: rowsVersion }), [isCurrent, rowsVersion]);

  const selection = useDocumentSelection(rows, args, rowsStatus);
  const { cancel, keepOnly } = selection;
  // Whatever was refused as being read, or not deleted because a request failed, stays ticked to retry; otherwise the pick is over.
  const bulkDelete = useBulkDeleteDocuments(({ beingReadIds, failedIds }) => {
    const toRetry = [...beingReadIds, ...failedIds];
    if (toRetry.length === 0) cancel();
    else keepOnly(toRetry);
  });

  // Selection is a writer's tool: if write access goes away mid-pick, stop.
  useEffect(() => {
    if (!canWrite) cancel();
  }, [canWrite, cancel]);

  const filterCount = activeDocumentFilterCount(view);
  const isNarrowed = !isDefaultDocumentView(view) || filter !== "all";
  const selectedCount = selection.selectedIds.length;
  const workspaceTotal = summary.data?.total ?? list.total;

  function applyView({ search, ...next }: DocumentListView): void {
    setSearchText(search);
    setOptions(next);
  }

  function clearNarrowing(): void {
    applyView(DEFAULT_DOCUMENT_VIEW);
    onFilterChange("all");
  }

  function showFailed(): void {
    applyView({ ...DEFAULT_DOCUMENT_VIEW, statuses: ["failed"] });
    onFilterChange("all");
  }

  const { isSelecting, selected, start, toggle } = selection;
  const openDocument = useCallback(
    (id: string) => (isSelecting ? toggle(id) : router.push(`/documents/${id}`)),
    [isSelecting, toggle],
  );
  const renderDocument = useCallback<ListRenderItem<Document>>(
    ({ item }) => (
      <DocumentRow
        document={item}
        isSelected={selected ? selected.has(item.id) : undefined}
        isUnselectable={isSelecting && !isActionable(item)}
        onLongPress={canWrite && isActionable(item) ? start : undefined}
        onPress={openDocument}
      />
    ),
    [selected, isSelecting, canWrite, start, openDocument],
  );

  const uploadStatus = (
    <View style={{ padding: spacing.lg }}>
      <UploadStatus />
    </View>
  );

  if (list.isLoading) return <DocumentsSkeleton />;
  if (list.loadError !== undefined && !list.hasData) {
    return (
      <View style={{ flex: 1 }}>
        {uploadStatus}
        <EmptyState
          action={{ label: DOCUMENT_LIST_MESSAGES.tryAgain, onPress: refresh }}
          body={DOCUMENT_LIST_MESSAGES.loadFailedBody}
          heading={DOCUMENT_LIST_MESSAGES.loadFailedHeading}
        />
      </View>
    );
  }
  // No documents at all, not just none matching: the list says so unfiltered, the counts when it is filtered.
  if (isCurrent && list.total === 0 && (!isNarrowed || summary.data?.total === 0)) {
    return (
      <View style={{ flex: 1 }}>
        {uploadStatus}
        <EmptyState
          action={canWrite ? { label: DOCUMENT_LIST_MESSAGES.takePhoto, onPress: () => router.push("/camera") } : undefined}
          body={canWrite ? DOCUMENT_LIST_MESSAGES.emptyBodyWriter : DOCUMENT_LIST_MESSAGES.emptyBodyViewer}
          heading={DOCUMENT_LIST_MESSAGES.emptyHeading}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {selection.isSelecting ? (
        <DocumentSelectionHeader
          hiddenNote={selection.hiddenCount > 0 ? hiddenSelectedNote(selection.hiddenCount) : null}
          isBusy={bulkDelete.isDeleting}
          isChecking={selection.isChecking}
          isSelectingAll={selection.isSelectingAll}
          onCancel={selection.cancel}
          onSelectAll={() => void selection.selectAll()}
          selectableCount={selection.selectableCount}
          selectedCount={selectedCount}
          unselectableCount={selection.beingReadCount}
        />
      ) : null}
      <FlatList
        ListEmptyComponent={
          !isCurrent && list.isFetching ? (
            <DocumentsSkeleton />
          ) : list.loadError !== undefined ? (
            <EmptyState
              action={{ label: DOCUMENT_LIST_MESSAGES.tryAgain, onPress: refresh }}
              body={DOCUMENT_LIST_MESSAGES.loadFailedBody}
              heading={DOCUMENT_LIST_MESSAGES.loadFailedHeading}
            />
          ) : (
            <Text style={{ padding: spacing.lg, fontSize: fontSize.md, color: colors.mutedForeground }}>
              {DOCUMENT_LIST_MESSAGES.nothingMatches}
            </Text>
          )
        }
        ListFooterComponent={
          <PagedListFooter
            isLoadingMore={list.isFetchingNextPage}
            loadMoreFailed={list.isLoadMoreError}
            loadingLabel={DOCUMENT_LIST_MESSAGES.loadingMore}
            onRetry={list.loadMore}
            skeletonRow={
              <View style={{ padding: spacing.lg }}>
                <DocumentSkeletonRow />
              </View>
            }
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            <UploadStatus />
            <StaleDataBanner isShown={Boolean(list.error && rows.length > 0 && !list.isLoadMoreError)} />
            {gaveUp ? (
              <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
                {STILL_READING_MESSAGE}
              </Text>
            ) : null}
            {isFailedNoticeDismissed ? null : (
              <FailedDocumentsNotice failed={failed} onDismiss={() => setIsFailedNoticeDismissed(true)} onShow={showFailed} />
            )}
            <SearchField
              accessibilityLabel={DOCUMENT_LIST_MESSAGES.searchLabel}
              onChangeText={setSearchText}
              onClear={() => setSearchText("")}
              placeholder={DOCUMENT_LIST_MESSAGES.searchPlaceholder}
              value={view.search}
            />
            <SegmentedControl
              accessibilityLabel={DOCUMENT_LIST_MESSAGES.segmentsLabel}
              onChange={onFilterChange}
              segments={DOCUMENT_FILTERS}
              value={filter}
            />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <LoadingButton
                accessibilityLabel={filtersAccessibilityLabel(filterCount)}
                onPress={() => setIsFilterSheetOpen(true)}
                style={{ flex: 1 }}
                variant="secondary"
              >
                {filtersButtonLabel(filterCount)}
              </LoadingButton>
              {canWrite && !selection.isSelecting && rows.some(isActionable) ? (
                <LoadingButton accessibilityLabel={DOCUMENT_BULK_MESSAGES.selectLabel} onPress={() => selection.start()} style={{ flex: 1 }} variant="secondary">
                  {DOCUMENT_BULK_MESSAGES.select}
                </LoadingButton>
              ) : null}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.mutedForeground }}>
                {documentCountLabel(list.total, isNarrowed ? workspaceTotal : list.total)}
              </Text>
              {isNarrowed ? (
                <LoadingButton onPress={clearNarrowing} variant="ghost">
                  {DOCUMENT_LIST_MESSAGES.clearFilters}
                </LoadingButton>
              ) : null}
            </View>
          </View>
        }
        data={rows}
        extraData={selection.selected}
        keyExtractor={(document) => document.id}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => {
          if (canLoadMore(list)) list.loadMore();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={refreshControl}
        renderItem={renderDocument}
        testID="documents-list"
      />
      {selection.isSelecting ? (
        <DocumentBulkBar
          isChecking={selection.isChecking}
          isDeleting={bulkDelete.isDeleting}
          onDelete={() => bulkDelete.askToDelete(selection.selectedIds)}
          selectedCount={selectedCount}
        />
      ) : null}
      {isFilterSheetOpen ? (
        <DocumentFilterSheet
          onApply={(next) => {
            setIsFilterSheetOpen(false);
            applyView(next);
          }}
          onClose={() => setIsFilterSheetOpen(false)}
          view={view}
        />
      ) : null}
    </View>
  );
}
