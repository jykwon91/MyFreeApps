import { DOCUMENT_LIBRARY_VIEW } from "@mybookkeeper/api-client/constants/documentListView";
import { useDocumentsPages } from "@mybookkeeper/api-client/hooks/useDocumentsPages";
import { LoadingButton, OptionSheet, useTheme } from "@platform/mobile";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { PICKER_LOAD_MESSAGES } from "../../constants/pickerLoad";
import { pagedChoices } from "../../lib/pagedChoices";
import type { DocumentReaderMessages } from "../../types/DocumentReaderMessages";
import PagedChoicesFooter from "../shell/PagedChoicesFooter";
import DocumentLibrarySkeleton from "./DocumentLibrarySkeleton";

interface DocumentLibrarySheetProps {
  messages: DocumentReaderMessages;
  isOpen: boolean;
  onClose: () => void;
  onPick: (documentId: string, name: string) => void;
}

/** A document already in the library, as the other way to read: every one of them, a page at a time. */
export default function DocumentLibrarySheet({ messages: MESSAGES, isOpen, onClose, onPick }: DocumentLibrarySheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const pages = useDocumentsPages(DOCUMENT_LIBRARY_VIEW, { skip: !isOpen });
  const { documents, hasData, error, isFetching, refetch } = pages;
  const options = useMemo(
    () => documents.map((document) => ({ value: document.id, label: document.file_name ?? MESSAGES.untitled })),
    [documents, MESSAGES.untitled],
  );
  const choices = pagedChoices(pages, options);
  // An empty list is only "no documents" once the answer is in: loading and failing read differently.
  const placeholder =
    hasData ? undefined : isFetching ? (
      <DocumentLibrarySkeleton label={MESSAGES.libraryLoading} />
    ) : error ? (
      <View style={{ gap: spacing.md, padding: spacing.lg }}>
        <Text accessibilityRole="alert" style={{ fontSize: fontSize.md, color: colors.destructiveText }}>
          {MESSAGES.libraryFailed}
        </Text>
        <LoadingButton onPress={() => refetch()} variant="secondary">
          {MESSAGES.libraryRetry}
        </LoadingButton>
      </View>
    ) : (
      <DocumentLibrarySkeleton label={MESSAGES.libraryLoading} />
    );
  return (
    <OptionSheet
      emptyContent={placeholder}
      emptyText={MESSAGES.libraryEmpty}
      footer={<PagedChoicesFooter choices={choices} loadingLabel={PICKER_LOAD_MESSAGES.loadingMoreDocuments} />}
      isOpen={isOpen}
      onClose={onClose}
      onEndReached={choices.loadMoreIfAny}
      onSelect={(documentId) => onPick(documentId, options.find((option) => option.value === documentId)?.label ?? MESSAGES.untitled)}
      options={options}
      title={MESSAGES.librarySheetTitle}
      value=""
    />
  );
}
