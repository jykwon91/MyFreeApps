import { useGetAttributionReviewQueueQuery } from "@mybookkeeper/api-client/store/attributionApi";
import { Banner, EmptyState, useRefresh, useTheme } from "@platform/mobile";
import { FlatList, Text, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { PAYMENT_REVIEW_MESSAGES as MESSAGES } from "../../constants/paymentReview";
import { useCanWrite } from "../workspace/useCanWrite";
import { moreWaitingLine, queueCountLine } from "./paymentReviewDisplay";
import PaymentReviewRow from "./PaymentReviewRow";
import PaymentReviewSkeleton from "./PaymentReviewSkeleton";

export default function PaymentReviewScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const { currentData, error, isFetching, refetch } = useGetAttributionReviewQueueQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const rows = currentData?.items ?? [];
  const waiting = (currentData?.pending_count ?? 0) - rows.length;

  // Clearing the loaded rows leaves more on the server, and that isn't caught up.
  const isCaughtUp = currentData !== undefined && currentData.pending_count === 0;
  const emptyList = isCaughtUp ? (
    <EmptyState body={MESSAGES.noneBody} heading={MESSAGES.noneHeading} />
  ) : isFetching ? (
    <PaymentReviewSkeleton />
  ) : (
    <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoad} />
  );

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListFooterComponent={
        rows.length > 0 && waiting > 0 ? (
          <Text style={{ padding: spacing.lg, fontSize: fontSize.sm, color: colors.mutedForeground }}>{moreWaitingLine(waiting)}</Text>
        ) : undefined
      }
      ListHeaderComponent={
        rows.length > 0 ? (
          <View style={{ gap: spacing.sm, padding: spacing.lg }}>
            {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
            {canWrite ? null : <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.viewOnly}</Text>}
            <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
              {queueCountLine(currentData?.pending_count ?? rows.length)}
            </Text>
          </View>
        ) : undefined
      }
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      keyExtractor={(item) => item.id}
      refreshControl={refreshControl}
      renderItem={({ item }) => <PaymentReviewRow canWrite={canWrite} item={item} />}
      testID="payment-review-list"
    />
  );
}
