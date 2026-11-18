import { useGetReviewQueueQuery } from "@mybookkeeper/api-client/store/calendarApi";
import { EmptyState, StaleDataBanner, useRefresh, useTheme } from "@platform/mobile";
import { FlatList, Text } from "react-native";
import { REVIEW_MESSAGES } from "../../constants/calendarReview";
import { useCanWrite } from "../workspace/useCanWrite";
import ReviewQueueCard from "./ReviewQueueCard";
import ReviewQueueSkeleton from "./ReviewQueueSkeleton";

export default function ReviewQueueScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const { currentData: items, error, isFetching, refetch } = useGetReviewQueueQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);

  function empty() {
    if (!items && (isFetching || !error)) return <ReviewQueueSkeleton />;
    if (!items) {
      return (
        <EmptyState
          action={{ label: REVIEW_MESSAGES.tryAgain, onPress: refresh }}
          body={REVIEW_MESSAGES.checkConnection}
          heading={REVIEW_MESSAGES.couldntLoad}
        />
      );
    }
    return <EmptyState body={REVIEW_MESSAGES.emptyBody} heading={REVIEW_MESSAGES.emptyHeading} />;
  }

  return (
    <FlatList
      ListEmptyComponent={empty()}
      ListHeaderComponent={
        <>
          <Text style={{ padding: spacing.lg, fontSize: fontSize.md, color: colors.mutedForeground }}>{REVIEW_MESSAGES.intro}</Text>
          <StaleDataBanner isShown={Boolean(error && items)} style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md }} />
          {canWrite ? null : (
            <Text style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md, fontSize: fontSize.sm, color: colors.mutedForeground }}>
              {REVIEW_MESSAGES.viewOnly}
            </Text>
          )}
        </>
      }
      contentInsetAdjustmentBehavior="automatic"
      data={items ?? []}
      keyExtractor={(item) => item.id}
      refreshControl={refreshControl}
      renderItem={({ item }) => <ReviewQueueCard canWrite={canWrite} item={item} />}
    />
  );
}
