import { DOCUMENT_KIND_FILTER_OPTIONS } from "@myjobhunter/api-client/constants/documentKindFilterOptions";
import { useListDocumentsQuery } from "@myjobhunter/api-client/store/documentsApi";
import type { Document } from "@myjobhunter/api-client/types/document/document";
import type { DocumentKindFilter } from "@myjobhunter/api-client/types/document/document-kind-filter";
import { documentsFilter } from "@myjobhunter/api-client/utils/documentsFilter";
import { EmptyState, OptionSheet, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { DOCUMENTS_SCREEN_MESSAGES as MESSAGES } from "../../constants/documentsScreen";
import DocumentCard from "./DocumentCard";
import DocumentSheet from "./DocumentSheet";
import DocumentsListHeader from "./DocumentsListHeader";
import DocumentsSkeleton from "./DocumentsSkeleton";
import DocumentUploadSheet from "./DocumentUploadSheet";

/** The website's Documents page: every document newest first, filtered by type, with upload, write, open, edit and delete. */
export default function DocumentsScreen() {
  const { colors, spacing } = useTheme();
  const [kind, setKind] = useState<DocumentKindFilter>("all");
  const [isKindSheetOpen, setIsKindSheetOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [editing, setEditing] = useState<Document | null>(null);
  // The server filters by type, as it does for the website; `data` is whatever loaded last, for any type.
  const { currentData, data, error, isFetching, refetch } = useListDocumentsQuery(documentsFilter(kind));
  const { isRefreshing, refresh, refreshControl } = useRefresh(refetch, error);
  const kindLabel = DOCUMENT_KIND_FILTER_OPTIONS.find((option) => option.value === kind)?.label ?? kind;

  function emptyList() {
    if (!currentData && isFetching) return <DocumentsSkeleton withHeader={!data} />;
    if (!currentData) {
      return <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh, isLoading: isRefreshing }} body={MESSAGES.tryAgainOffer} heading={MESSAGES.couldntLoadList} />;
    }
    if (kind !== "all") {
      return <EmptyState action={{ label: MESSAGES.showAllTypes, onPress: () => setKind("all") }} body={MESSAGES.noneOfKindBody} heading={MESSAGES.noneOfKindHeading(kindLabel)} />;
    }
    return <EmptyState body={MESSAGES.noneBody} heading={MESSAGES.noneHeading} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        ListEmptyComponent={emptyList()}
        ListHeaderComponent={
          // Shown once anything has loaded; until then the skeleton stands in for it.
          data ? (
            <DocumentsListHeader
              isStale={Boolean(error && currentData)}
              kindLabel={kindLabel}
              onChooseKind={() => setIsKindSheetOpen(true)}
              onUpload={() => setIsUploading(true)}
              onWrite={() => setIsWriting(true)}
            />
          ) : undefined
        }
        contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }}
        contentInsetAdjustmentBehavior="automatic"
        data={currentData?.items ?? []}
        keyExtractor={(document) => document.id}
        refreshControl={refreshControl}
        renderItem={({ item }) => <DocumentCard document={item} onEdit={setEditing} onOpenApplication={(id) => router.push(`/applications/${id}`)} />}
        testID="documents-list"
      />
      <OptionSheet
        isOpen={isKindSheetOpen}
        onClose={() => setIsKindSheetOpen(false)}
        onSelect={(next) => {
          setIsKindSheetOpen(false);
          setKind(next);
        }}
        options={DOCUMENT_KIND_FILTER_OPTIONS}
        title={MESSAGES.kindSheetTitle}
        value={kind}
      />
      {isUploading ? <DocumentUploadSheet onClose={() => setIsUploading(false)} /> : null}
      {isWriting ? <DocumentSheet onClose={() => setIsWriting(false)} /> : null}
      {editing ? <DocumentSheet document={editing} key={editing.id} onClose={() => setEditing(null)} /> : null}
    </View>
  );
}
