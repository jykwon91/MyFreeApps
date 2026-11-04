import { Banner, EmptyState, SearchField, SegmentedControl, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Linking, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { STILL_READING_MESSAGE } from "../../constants/documents";
import { DOCUMENT_FILTERS, type DocumentFilter } from "../../constants/documentFilters";
import { useCanWrite } from "../workspace/useCanWrite";
import { documentName, needsALook } from "./documentDisplay";
import DocumentRow from "./DocumentRow";
import DocumentsSkeleton from "./DocumentsSkeleton";
import { useDocumentsWithPolling } from "./useDocumentsWithPolling";

export default function DocumentsScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DocumentFilter>("all");

  const { data, error, gaveUp, isLoading, refetch } = useDocumentsWithPolling();
  const { refresh, refreshControl } = useRefresh(refetch, error);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? [])
      .filter((document) => filter === "all" || needsALook(document))
      .filter((document) => !term || documentName(document).toLowerCase().includes(term));
  }, [data, filter, search]);

  if (isLoading) return <DocumentsSkeleton />;
  if (error && !data) {
    return (
      <EmptyState
        action={{ label: "Try again", onPress: refresh }}
        body="Want me to try again?"
        heading="I couldn't load your documents."
      />
    );
  }
  if (data?.length === 0) {
    return (
      <EmptyState
        action={canWrite ? { label: "Open the website", onPress: () => Linking.openURL(`${WEB_BASE_URL}/documents`) } : undefined}
        body={canWrite ? "Upload a receipt or invoice on the website and I'll read it for you." : "They'll show up here once someone adds one."}
        heading="No documents yet"
      />
    );
  }

  return (
    <FlatList
      ListEmptyComponent={
        <Text style={{ padding: spacing.lg, fontSize: fontSize.md, color: colors.mutedForeground }}>
          Nothing matches that.
        </Text>
      }
      ListHeaderComponent={
        <View style={{ gap: spacing.md, padding: spacing.lg }}>
          {error ? <Banner message="You're offline, or I can't reach the server. This is what I last loaded." /> : null}
          {gaveUp ? (
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
              {STILL_READING_MESSAGE}
            </Text>
          ) : null}
          <SearchField
            accessibilityLabel="Search documents"
            onChangeText={setSearch}
            onClear={() => setSearch("")}
            placeholder="Search by file name"
            value={search}
          />
          <SegmentedControl
            accessibilityLabel="Which documents to show"
            onChange={setFilter}
            segments={DOCUMENT_FILTERS}
            value={filter}
          />
        </View>
      }
      data={rows}
      keyExtractor={(document) => document.id}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
      renderItem={({ item }) => (
        <DocumentRow document={item} onPress={() => router.push(`/documents/${item.id}`)} />
      )}
      testID="documents-list"
    />
  );
}
