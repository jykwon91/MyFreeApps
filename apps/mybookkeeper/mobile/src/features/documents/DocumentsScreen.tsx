import { DOCUMENT_LIST_LIMIT } from "@mybookkeeper/api-client/constants/documentListLimit";
import { DEFAULT_DOCUMENT_VIEW } from "@mybookkeeper/api-client/constants/documentListView";
import type { DocumentListView } from "@mybookkeeper/api-client/types/document/DocumentListView";
import { activeDocumentFilterCount, isDefaultDocumentView, viewDocuments } from "@mybookkeeper/api-client/utils/documentListView";
import { Banner, EmptyState, LoadingButton, SHOWING_LAST_LOADED_MESSAGE, SearchField, SegmentedControl, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { DOCUMENT_BULK_MESSAGES, hiddenSelectedNote } from "../../constants/documentBulk";
import { DOCUMENT_FILTERS } from "../../constants/documentFilters";
import type { DocumentFilter } from "../../types/DocumentFilter";
import { cappedListLabel, DOCUMENT_LIST_MESSAGES, documentCountLabel, filtersAccessibilityLabel, filtersButtonLabel, STILL_READING_MESSAGE } from "../../constants/documents";
import { useRowSelection } from "../../lib/useRowSelection";
import UploadStatus from "../capture/UploadStatus";
import { useCanWrite } from "../workspace/useCanWrite";
import { isActionable, isBeingRead, needsALook } from "./documentDisplay";
import DocumentBulkBar from "./DocumentBulkBar";
import DocumentFilterSheet from "./DocumentFilterSheet";
import DocumentRow from "./DocumentRow";
import DocumentSelectionHeader from "./DocumentSelectionHeader";
import DocumentsSkeleton from "./DocumentsSkeleton";
import FailedDocumentsNotice from "./FailedDocumentsNotice";
import { useBulkDeleteDocuments } from "./useBulkDeleteDocuments";
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
  const [view, setView] = useState<DocumentListView>(DEFAULT_DOCUMENT_VIEW);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isFailedNoticeDismissed, setIsFailedNoticeDismissed] = useState(false);
  const selection = useRowSelection();
  const { cancel, keepOnly } = selection;
  // Whatever was refused as being read, or not deleted because a request failed, stays ticked to retry; otherwise the pick is over.
  const bulkDelete = useBulkDeleteDocuments(({ beingReadIds, failedIds }) => {
    const toRetry = [...beingReadIds, ...failedIds];
    if (toRetry.length === 0) cancel();
    else keepOnly(toRetry);
  });

  const { data, error, gaveUp, isLoading, refetch } = useDocumentsWithPolling();
  const { refresh, refreshControl } = useRefresh(refetch, error);

  const rows = useMemo(
    () => viewDocuments((data ?? []).filter((document) => filter === "all" || needsALook(document)), view),
    [data, filter, view],
  );
  const failed = useMemo(() => (data ?? []).filter((document) => document.status === "failed"), [data]);
  // Only finished, undeleted documents can be ticked: one being read or already deleted can't be acted on.
  const selectableIds = useMemo(() => rows.filter(isActionable).map((document) => document.id), [rows]);
  const actionableIds = useMemo(() => (data ?? []).filter(isActionable).map((document) => document.id), [data]);
  // A tick outlives a search or filter that hides it (it is only noted), but never a document that is gone or busy.
  useEffect(() => keepOnly(actionableIds), [actionableIds, keepOnly]);
  const visibleSelectedIds = useMemo(
    () => selectableIds.filter((id) => selection.selected?.has(id)),
    [selectableIds, selection.selected],
  );
  const hiddenSelectedCount = (selection.selected?.size ?? 0) - visibleSelectedIds.length;
  const isCapped = (data?.length ?? 0) >= DOCUMENT_LIST_LIMIT;

  // Selection is a writer's tool: if write access goes away mid-pick, stop.
  useEffect(() => {
    if (!canWrite) cancel();
  }, [canWrite, cancel]);

  const filterCount = activeDocumentFilterCount(view);
  const isNarrowed = !isDefaultDocumentView(view) || filter !== "all";
  const selectedCount = visibleSelectedIds.length;

  function clearNarrowing(): void {
    setView(DEFAULT_DOCUMENT_VIEW);
    onFilterChange("all");
  }

  function showFailed(): void {
    setView({ ...DEFAULT_DOCUMENT_VIEW, statuses: ["failed"] });
    onFilterChange("all");
  }

  const uploadStatus = (
    <View style={{ padding: spacing.lg }}>
      <UploadStatus />
    </View>
  );

  if (isLoading) return <DocumentsSkeleton />;
  if (error && !data) {
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
  if (data?.length === 0) {
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
          hiddenNote={hiddenSelectedCount > 0 ? hiddenSelectedNote(hiddenSelectedCount) : null}
          isBusy={bulkDelete.isDeleting}
          isCapped={isCapped}
          onCancel={selection.cancel}
          onSelectAll={() => selection.selectAll(selectableIds)}
          selectableCount={selectableIds.length}
          selectedCount={selectedCount}
          unselectableCount={rows.filter(isBeingRead).length}
        />
      ) : null}
      <FlatList
        ListEmptyComponent={
          <Text style={{ padding: spacing.lg, fontSize: fontSize.md, color: colors.mutedForeground }}>
            {DOCUMENT_LIST_MESSAGES.nothingMatches}
          </Text>
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            <UploadStatus />
            {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
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
              onChangeText={(search) => setView({ ...view, search })}
              onClear={() => setView({ ...view, search: "" })}
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
              {canWrite && !selection.isSelecting && selectableIds.length > 0 ? (
                <LoadingButton accessibilityLabel={DOCUMENT_BULK_MESSAGES.selectLabel} onPress={() => selection.start()} style={{ flex: 1 }} variant="secondary">
                  {DOCUMENT_BULK_MESSAGES.select}
                </LoadingButton>
              ) : null}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.mutedForeground }}>
                {isCapped ? cappedListLabel() : documentCountLabel(rows.length, data?.length ?? 0)}
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
        refreshControl={refreshControl}
        renderItem={({ item }) => (
          <DocumentRow
            document={item}
            isSelected={selection.selected ? selection.selected.has(item.id) : undefined}
            isUnselectable={selection.isSelecting && !isActionable(item)}
            onLongPress={canWrite && isActionable(item) ? () => selection.start(item.id) : undefined}
            onPress={() => (selection.isSelecting ? selection.toggle(item.id) : router.push(`/documents/${item.id}`))}
          />
        )}
        testID="documents-list"
      />
      {selection.isSelecting ? (
        <DocumentBulkBar
          isDeleting={bulkDelete.isDeleting}
          onDelete={() => bulkDelete.askToDelete(visibleSelectedIds)}
          selectedCount={selectedCount}
        />
      ) : null}
      {isFilterSheetOpen ? (
        <DocumentFilterSheet
          onApply={(next) => {
            setIsFilterSheetOpen(false);
            setView(next);
          }}
          onClose={() => setIsFilterSheetOpen(false)}
          view={view}
        />
      ) : null}
    </View>
  );
}
