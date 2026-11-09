import {
  useDismissQueueItemMutation,
  useIgnoreQueueItemMutation,
  useResolveQueueItemMutation,
} from "@mybookkeeper/api-client/store/calendarApi";
import type { ReviewQueueItem } from "@mybookkeeper/api-client/types/calendar/review-queue-item";
import { LoadingButton, OptionSheet, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { REVIEW_MESSAGES } from "../../constants/calendarReview";
import { addFailure, dismissFailure, ignoreFailure } from "./reviewQueueFailures";
import { reviewItemChannel, reviewItemDetails, reviewItemListingKey, reviewItemSubject, reviewQueueSpokenLabel } from "./reviewQueueDisplay";

interface ReviewQueueCardProps {
  item: ReviewQueueItem;
  listings: readonly { value: string; label: string }[];
  canWrite: boolean;
}

export default function ReviewQueueCard({ item, listings, canWrite }: ReviewQueueCardProps) {
  const { colors, spacing, fontSize, radius } = useTheme();
  const { showToast } = useToast();
  const [isChoosing, setIsChoosing] = useState(false);
  const [resolve, { isLoading: isAdding }] = useResolveQueueItemMutation();
  const [ignore, { isLoading: isIgnoring }] = useIgnoreQueueItemMutation();
  const [dismiss, { isLoading: isDismissing }] = useDismissQueueItemMutation();
  const isBusy = isAdding || isIgnoring || isDismissing;

  async function add(listingId: string): Promise<void> {
    setIsChoosing(false);
    try {
      await resolve({ itemId: item.id, body: { listing_id: listingId } }).unwrap();
      showToast(REVIEW_MESSAGES.added);
    } catch (error) {
      showToast(addFailure(error), "error");
    }
  }

  async function ignoreForever(): Promise<void> {
    try {
      await ignore({ itemId: item.id, body: { source_listing_id: reviewItemListingKey(item) } }).unwrap();
      showToast(REVIEW_MESSAGES.ignored);
    } catch (error) {
      showToast(ignoreFailure(error), "error");
    }
  }

  async function dismissItem(): Promise<void> {
    try {
      await dismiss(item.id).unwrap();
      showToast(REVIEW_MESSAGES.dismissed);
    } catch (error) {
      showToast(dismissFailure(error), "error");
    }
  }

  function confirmIgnore(): void {
    Alert.alert(REVIEW_MESSAGES.ignoreTitle, REVIEW_MESSAGES.ignoreBody, [
      { text: REVIEW_MESSAGES.cancel, style: "cancel" },
      { text: REVIEW_MESSAGES.ignore, style: "destructive", onPress: () => void ignoreForever() },
    ]);
  }

  return (
    <View
      accessible={!canWrite}
      accessibilityLabel={canWrite ? undefined : reviewQueueSpokenLabel(item)}
      style={{
        gap: spacing.sm,
        marginHorizontal: spacing.lg,
        marginBottom: spacing.md,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        backgroundColor: colors.background,
      }}
    >
      <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.primary }}>{reviewItemChannel(item)}</Text>
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{reviewItemSubject(item)}</Text>
      {reviewItemDetails(item).map((detail) => (
        <Text key={detail} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {detail}
        </Text>
      ))}
      {canWrite ? (
        <>
          <LoadingButton disabled={isBusy} isLoading={isAdding} loadingText={REVIEW_MESSAGES.adding} onPress={() => setIsChoosing(true)}>
            {REVIEW_MESSAGES.add}
          </LoadingButton>
          <LoadingButton disabled={isBusy} isLoading={isIgnoring} loadingText={REVIEW_MESSAGES.ignoring} onPress={confirmIgnore} variant="secondary">
            {REVIEW_MESSAGES.ignore}
          </LoadingButton>
          <LoadingButton disabled={isBusy} isLoading={isDismissing} loadingText={REVIEW_MESSAGES.dismissing} onPress={() => void dismissItem()} variant="ghost">
            {REVIEW_MESSAGES.dismiss}
          </LoadingButton>
          <OptionSheet
            description={`Which listing does this ${reviewItemChannel(item)} booking belong to?`}
            emptyText={REVIEW_MESSAGES.noListings}
            isOpen={isChoosing}
            onClose={() => setIsChoosing(false)}
            onSelect={(listingId) => void add(listingId)}
            options={[...listings]}
            title={REVIEW_MESSAGES.chooseListing}
            value=""
          />
        </>
      ) : null}
    </View>
  );
}
