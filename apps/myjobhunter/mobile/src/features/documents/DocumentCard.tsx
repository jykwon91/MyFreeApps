import { useDeleteDocumentMutation, useLazyGetDocumentDownloadUrlQuery } from "@myjobhunter/api-client/store/documentsApi";
import { documentDownloadUrl } from "@myjobhunter/api-client/utils/documentDownloadUrl";
import { documentKindLabel, documentKindTone } from "@myjobhunter/api-client/utils/documentKind";
import { Chip, LoadingButton, useOpenLink, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { DOCUMENT_MESSAGES as MESSAGES } from "../../constants/documents";
import { documentMeta } from "../../lib/documentMeta";
import { writeFailure } from "../../lib/writeFailure";
import type { DocumentCardProps } from "../../types/DocumentCardProps";
import DocumentApplicationLink from "./DocumentApplicationLink";

/** A document's kind, title and date, the application it's for when asked, with Open for a file, Edit and Delete. */
export default function DocumentCard({ document, onEdit, onOpenApplication }: DocumentCardProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const { showToast } = useToast();
  const openLink = useOpenLink();
  const [getDownloadUrl] = useLazyGetDocumentDownloadUrlQuery();
  const [deleteDocument] = useDeleteDocumentMutation();
  const [isDeleting, setIsDeleting] = useState(false);
  const applicationId = document.application_id;

  async function open(): Promise<void> {
    try {
      // The link expires, so it's fetched fresh each time.
      const url = documentDownloadUrl(await getDownloadUrl(document.id).unwrap());
      if (url) await openLink(url);
      else showToast(MESSAGES.unsafeLink, "error");
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
        <Chip label={documentKindLabel(document.kind)} tone={documentKindTone(document.kind)} />
        {document.filename ? <Chip label={MESSAGES.file} /> : null}
      </View>
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }} testID="document-title">
        {document.title}
      </Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{documentMeta(document)}</Text>
      {onOpenApplication && applicationId ? (
        <DocumentApplicationLink onPress={() => onOpenApplication(applicationId)} title={document.title} />
      ) : null}
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
