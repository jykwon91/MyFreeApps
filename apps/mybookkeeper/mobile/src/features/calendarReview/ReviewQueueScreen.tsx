import { useGetListingsQuery } from "@mybookkeeper/api-client/store/listingsApi";
import { useGetReviewQueueQuery } from "@mybookkeeper/api-client/store/calendarApi";
import { Banner, EmptyState, useRefresh, useTheme } from "@platform/mobile";
import { useMemo } from "react";
import { FlatList, Text } from "react-native";
import { REVIEW_MESSAGES, REVIEW_QUEUE_LISTINGS_ARGS } from "../../constants/calendarReview";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { useCanWrite } from "../workspace/useCanWrite";
import ReviewQueueCard from "./ReviewQueueCard";
import ReviewQueueSkeleton from "./ReviewQueueSkeleton";

export default function ReviewQueueScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const { currentData: items, error, isFetching, refetch } = useGetReviewQueueQuery();
  const { data: listingsEnvelope } = useGetListingsQuery(REVIEW_QUEUE_LISTINGS_ARGS, { skip: !canWrite });
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const listings = useMemo(() => (listingsEnvelope?.items ?? []).map((listing) => ({ value: listing.id, label: listing.title })), [listingsEnvelope]);

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
          {error && items ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md }} /> : null}
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
      renderItem={({ item }) => <ReviewQueueCard canWrite={canWrite} item={item} listings={listings} />}
    />
  );
}
