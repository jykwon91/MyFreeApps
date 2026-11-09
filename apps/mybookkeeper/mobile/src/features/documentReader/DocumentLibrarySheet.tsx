import { useGetDocumentsQuery } from "@mybookkeeper/api-client/store/documentsApi";
import { LoadingButton, OptionSheet, useTheme } from "@platform/mobile";
import { useMemo } from "react";
import { Text, View } from "react-native";
import type { DocumentReaderMessages } from "../../types/DocumentReaderMessages";
import DocumentLibrarySkeleton from "./DocumentLibrarySkeleton";

interface DocumentLibrarySheetProps {
  messages: DocumentReaderMessages;
  isOpen: boolean;
  onClose: () => void;
  onPick: (documentId: string, name: string) => void;
}

/** A document already in the library, as the other way to read. */
export default function DocumentLibrarySheet({ messages: MESSAGES, isOpen, onClose, onPick }: DocumentLibrarySheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { data, error, isFetching, refetch } = useGetDocumentsQuery({ excludeProcessing: true }, { skip: !isOpen });
  const options = useMemo(
    () => (data ?? []).map((document) => ({ value: document.id, label: document.file_name ?? MESSAGES.untitled })),
    [data, MESSAGES.untitled],
  );
  // An empty list is only "no documents" once the answer is in: loading and failing read differently.
  const placeholder =
    data !== undefined ? undefined : isFetching ? (
      <DocumentLibrarySkeleton label={MESSAGES.libraryLoading} />
    ) : error ? (
      <View style={{ gap: spacing.md, padding: spacing.lg }}>
        <Text accessibilityRole="alert" style={{ fontSize: fontSize.md, color: colors.destructiveText }}>
          {MESSAGES.libraryFailed}
        </Text>
        <LoadingButton onPress={() => void refetch()} variant="secondary">
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
      isOpen={isOpen}
      onClose={onClose}
      onSelect={(documentId) => onPick(documentId, options.find((option) => option.value === documentId)?.label ?? MESSAGES.untitled)}
      options={options}
      title={MESSAGES.librarySheetTitle}
      value=""
    />
  );
}
