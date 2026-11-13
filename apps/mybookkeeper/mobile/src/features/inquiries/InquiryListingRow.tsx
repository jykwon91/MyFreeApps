import { useGetListingByIdQuery } from "@mybookkeeper/api-client/store/listingsApi";
import { INQUIRY_LISTING_LABELS } from "@mybookkeeper/api-client/constants/inquiryListingLabels";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { MIN_TOUCH_TARGET, Skeleton, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { INQUIRY_LISTING_MESSAGES } from "../../constants/inquiries";
import TransactionFact from "../transactions/TransactionFact";

const GONE_STATUSES: readonly number[] = [403, 404];

export default function InquiryListingRow({ listingId }: { listingId: string | null }) {
  const { colors, spacing, fontSize } = useTheme();
  const { data: listing, error, isLoading } = useGetListingByIdQuery(listingId ?? "", { skip: !listingId });

  if (!listingId) return <TransactionFact label={INQUIRY_LISTING_LABELS.heading} value={INQUIRY_LISTING_LABELS.notLinked} />;
  if (isLoading) {
    return (
      <View accessibilityLabel={INQUIRY_LISTING_MESSAGES.loading} style={{ gap: spacing.xs }}>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{INQUIRY_LISTING_LABELS.heading}</Text>
        <Skeleton height={20} width="50%" />
      </View>
    );
  }
  const status = httpStatus(error);
  if (status !== undefined && GONE_STATUSES.includes(status)) {
    return <TransactionFact label={INQUIRY_LISTING_LABELS.heading} value={INQUIRY_LISTING_MESSAGES.unavailable} />;
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{INQUIRY_LISTING_LABELS.heading}</Text>
      {listing ? <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{listing.title}</Text> : null}
      <Pressable
        accessibilityLabel={listing ? `${INQUIRY_LISTING_LABELS.viewListing}: ${listing.title}` : INQUIRY_LISTING_LABELS.viewListing}
        accessibilityRole="link"
        onPress={() => router.push(`/listings/${listingId}`)}
        style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}
      >
        <Text style={{ fontSize: fontSize.md, color: colors.primary }}>{INQUIRY_LISTING_LABELS.viewListing}</Text>
      </Pressable>
    </View>
  );
}
