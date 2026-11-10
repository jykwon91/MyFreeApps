import { DOCUMENT_KIND_LABELS } from "@myjobhunter/api-client/constants/documentKindLabels";
import { useDeleteDocumentMutation, useLazyGetDocumentDownloadUrlQuery } from "@myjobhunter/api-client/store/documentsApi";
import { Chip, LoadingButton, useOpenLink, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { APPLICATION_DOCUMENT_MESSAGES as MESSAGES } from "../../constants/applicationDocuments";
import { documentMeta } from "../../lib/documentMeta";
import { writeFailure } from "../../lib/writeFailure";
import type { DocumentCardProps } from "../../types/DocumentCardProps";

/** A document's kind, title and date, with Open for a file, Edit and Delete. */
export default function DocumentCard({ document, onEdit }: DocumentCardProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const { showToast } = useToast();
  const openLink = useOpenLink();
  const [getDownloadUrl] = useLazyGetDocumentDownloadUrlQuery();
  const [deleteDocument] = useDeleteDocumentMutation();
  const [isDeleting, setIsDeleting] = useState(false);

  async function open(): Promise<void> {
    try {
      // The link expires, so it's fetched fresh each time.
      const { url } = await getDownloadUrl(document.id).unwrap();
      await openLink(url);
    } catch (error) {
      showToast(writeFailure(error, MESSAGES.couldntOpen), "error");
    }
  }

  async function remove(): Promise<void> {
    setIsDeleting(true);
    try {
      await deleteDocument(document.id).unwrap();
      showToast(MESSAGES.deleted);
    } catch (error) {
      showToast(writeFailure(error, MESSAGES.couldntDelete), "error");
      setIsDeleting(false);
    }
  }

  function confirmDelete(): void {
    Alert.alert(MESSAGES.deleteTitle, `"${document.title}" — ${MESSAGES.deleteBody}`, [
      { text: MESSAGES.keep, style: "cancel" },
      { text: MESSAGES.delete, style: "destructive", onPress: () => void remove() },
    ]);
  }

  return (
    <View
      style={{ gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card }}
      testID={`document-${document.id}`}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <Chip label={DOCUMENT_KIND_LABELS[document.kind] ?? document.kind} />
        {document.filename ? <Chip label={MESSAGES.file} /> : null}
      </View>
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{document.title}</Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{documentMeta(document)}</Text>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {document.has_file ? (
          <LoadingButton accessibilityLabel={`${MESSAGES.open} ${document.title}`} disabled={isDeleting} loadingText={MESSAGES.opening} onPress={open} style={{ flex: 1 }} variant="secondary">
            {MESSAGES.open}
          </LoadingButton>
        ) : null}
        <LoadingButton accessibilityLabel={`${MESSAGES.edit} ${document.title}`} disabled={isDeleting} onPress={() => onEdit(document)} style={{ flex: 1 }} variant="secondary">
          {MESSAGES.edit}
        </LoadingButton>
        <LoadingButton
          accessibilityLabel={`${MESSAGES.delete} ${document.title}`}
          isLoading={isDeleting}
          loadingText={MESSAGES.deleting}
          onPress={confirmDelete}
          style={{ flex: 1 }}
          variant="ghost"
        >
          {MESSAGES.delete}
        </LoadingButton>
      </View>
    </View>
  );
}
