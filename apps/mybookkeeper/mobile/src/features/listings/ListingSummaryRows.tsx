import { useGetListingChannelsQuery } from "@mybookkeeper/api-client/store/listingsApi";
import type { ListingResponse } from "@mybookkeeper/api-client/types/listing/listing-response";
import { router } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@platform/mobile";
import { countText, LISTING_MESSAGES } from "../../constants/listings";
import ListingSummaryRow from "./ListingSummaryRow";

export default function ListingSummaryRows({ listing }: { listing: ListingResponse }) {
  const { spacing } = useTheme();
  const { data: channels, isError } = useGetListingChannelsQuery(listing.id);
  const photoCount = listing.photos.length;
  const linkCount = listing.external_ids.length;
  const channelValue = channels ? countText(channels.length, "channel", "channels") : isError ? LISTING_MESSAGES.couldntCount : "…";

  return (
    <View style={{ gap: spacing.sm }}>
      <ListingSummaryRow label={LISTING_MESSAGES.photos} onPress={() => router.push(`/listings/${listing.id}/photos`)} value={photoCount === 0 ? LISTING_MESSAGES.noPhotos : countText(photoCount, "photo", "photos")} />
      <ListingSummaryRow label={LISTING_MESSAGES.externalLinks} onPress={() => router.push(`/listings/${listing.id}/links`)} value={linkCount === 0 ? LISTING_MESSAGES.noLinks : countText(linkCount, "link", "links")} />
      <ListingSummaryRow label={LISTING_MESSAGES.channels} onPress={() => router.push(`/listings/${listing.id}/channels`)} value={channelValue} />
    </View>
  );
}
