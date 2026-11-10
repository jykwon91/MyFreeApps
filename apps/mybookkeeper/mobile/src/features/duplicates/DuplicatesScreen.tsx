import { useGetDuplicatesQuery } from "@mybookkeeper/api-client/store/transactionsApi";
import { Banner, EmptyState, SHOWING_LAST_LOADED_MESSAGE, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { FlatList, Text, View } from "react-native";
import { DUPLICATES_MESSAGES as MESSAGES } from "../../constants/duplicates";
import { useCanWrite } from "../workspace/useCanWrite";
import { duplicateCountLine } from "./duplicateDisplay";
import DuplicateRow from "./DuplicateRow";
import DuplicatesSkeleton from "./DuplicatesSkeleton";

export default function DuplicatesScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const { data, error, isLoading, refetch } = useGetDuplicatesQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const pairs = data?.pairs ?? [];

  if (isLoading) return <DuplicatesSkeleton />;

  const emptyList = data ? (
    <EmptyState body={MESSAGES.noneBody} heading={MESSAGES.noneHeading} />
  ) : (
    <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoad} />
  );

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListHeaderComponent={
        pairs.length > 0 ? (
          <View style={{ gap: spacing.sm, padding: spacing.lg }}>
            {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
            {canWrite ? null : <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.viewOnly}</Text>}
            <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
              {duplicateCountLine(pairs.length)}
            </Text>
          </View>
        ) : undefined
      }
      contentInsetAdjustmentBehavior="automatic"
      data={pairs}
      keyExtractor={(pair) => pair.id}
      refreshControl={refreshControl}
      renderItem={({ item }) => <DuplicateRow onPress={() => router.push(`/duplicates/${item.id}`)} pair={item} />}
      testID="duplicates-list"
    />
  );
}
