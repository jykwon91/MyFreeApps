import {
  useDeleteDocumentMutation,
  useGetDocumentQuery,
  useReExtractDocumentMutation,
} from "@mybookkeeper/api-client/store/documentsApi";
import { EmptyState, LoadingButton, Skeleton, Toast, useAnnouncement, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { STILL_READING_MESSAGE } from "../../constants/documents";
import { useCanWrite } from "../workspace/useCanWrite";
import { documentName, documentStatusLine, documentTypeLabel, isBeingRead } from "./documentDisplay";
import DocumentFileView from "./DocumentFileView";
import DocumentStatusChip from "./DocumentStatusChip";
import { useProcessingPoll } from "./useProcessingPoll";

export default function DocumentDetailScreen({ id }: { id: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const [message, setMessage] = useState<string | null>(null);
  const { data: known } = useGetDocumentQuery(id);
  const { pollingInterval, gaveUp } = useProcessingPoll(known ? isBeingRead(known) : false);
  const { data: document, error, isLoading, refetch } = useGetDocumentQuery(id, { pollingInterval });
  const { refreshControl } = useRefresh(refetch, error);
  useAnnouncement(document ? (documentStatusLine(document) ?? undefined) : undefined);
  const [deleteDocument, { isLoading: isDeleting }] = useDeleteDocumentMutation();
  const [reExtract, { isLoading: isReExtracting }] = useReExtractDocumentMutation();

  if (isLoading) {
    return (
      <View style={{ gap: spacing.md, padding: spacing.lg }} testID="document-skeleton">
        <Skeleton height={28} />
        <Skeleton height={320} />
      </View>
    );
  }
  if (error && !document) {
    const isGone = "status" in error && error.status === 404;
    return (
      <EmptyState
        action={isGone ? { label: "Back", onPress: () => router.back() } : { label: "Try again", onPress: async () => { await refetch(); } }}
        body={isGone ? "It may have been deleted." : "Want me to try again?"}
        heading={isGone ? "I can't find that document." : "I couldn't load that document."}
      />
    );
  }
  if (!document) return null;

  const name = documentName(document);
  const statusLine = documentStatusLine(document);

  async function tryReadingAgain(): Promise<void> {
    try {
      await reExtract(id).unwrap();
    } catch {
      setMessage("I couldn't start over on that. Want to try again?");
    }
  }

  function confirmDelete(): void {
    Alert.alert(`Delete ${name}?`, "This can't be undone. Transactions I pulled from it stay in your books.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void remove() },
    ]);
  }

  async function remove(): Promise<void> {
    try {
      await deleteDocument(id).unwrap();
      router.back();
    } catch {
      setMessage("I couldn't delete that. Want to try again?");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
        <View style={{ gap: spacing.sm }}>
          <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {name}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <DocumentStatusChip document={document} />
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
              {documentTypeLabel(document)} · {new Date(document.created_at).toLocaleDateString()}
            </Text>
          </View>
          {statusLine ? <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{statusLine}</Text> : null}
          {gaveUp ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{STILL_READING_MESSAGE}</Text> : null}
          {document.status === "failed" && document.error_message ? (
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{document.error_message}</Text>
          ) : null}
        </View>
        <DocumentFileView document={document} onError={setMessage} refreshDocument={() => refetch().unwrap()} />
        {canWrite ? (
          <View style={{ gap: spacing.sm }}>
            {document.status === "failed" ? (
              <LoadingButton isLoading={isReExtracting} loadingText="Starting over…" onPress={tryReadingAgain}>
                Try reading it again
              </LoadingButton>
            ) : null}
            <LoadingButton isLoading={isDeleting} loadingText="Deleting…" onPress={confirmDelete} variant="destructive">
              Delete
            </LoadingButton>
          </View>
        ) : null}
      </ScrollView>
      {message ? <Toast message={message} onDismiss={() => setMessage(null)} style={{ margin: spacing.lg }} variant="error" /> : null}
    </View>
  );
}
