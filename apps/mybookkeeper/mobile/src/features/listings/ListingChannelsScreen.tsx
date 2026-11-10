import { useGetListingChannelsQuery } from "@mybookkeeper/api-client/store/listingsApi";
import { Banner, EmptyState, LoadingButton, SHOWING_LAST_LOADED_MESSAGE, Skeleton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView, View } from "react-native";
import { LISTING_CHANNEL_MESSAGES as MESSAGES } from "../../constants/listingChannels";
import { LISTING_MESSAGES } from "../../constants/listings";
import { useCanWrite } from "../workspace/useCanWrite";
import ChannelListingRow from "./ChannelListingRow";
import ListingGate from "./ListingGate";

function ChannelsBody({ id }: { id: string }) {
  const { spacing } = useTheme();
  const canWrite = useCanWrite();
  const { currentData: channelListings, error, isFetching, refetch } = useGetListingChannelsQuery(id);
  const { refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const add = () => router.push(`/listings/${id}/channels/new`);

  if (!channelListings && (isFetching || !error)) {
    return (
      <View accessible accessibilityLabel={LISTING_MESSAGES.loadingOne} accessibilityRole="progressbar" style={{ gap: spacing.md, padding: spacing.lg }}>
        <Skeleton height={120} />
        <Skeleton height={120} />
      </View>
    );
  }
  if (!channelListings) {
    return <EmptyState action={{ label: MESSAGES.tryAgain, onPress: () => void refetch() }} body={MESSAGES.tryAgainOffer} heading={MESSAGES.couldntLoad} />;
  }
  if (channelListings.length === 0) {
    return (
      <EmptyState
        action={canWrite ? { label: MESSAGES.add, onPress: add } : undefined}
        body={canWrite ? MESSAGES.noneBody : MESSAGES.noneViewOnlyBody}
        heading={MESSAGES.noneHeading}
      />
    );
  }
  return (
    <ScrollView contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
      {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      {canWrite ? <LoadingButton onPress={add}>{MESSAGES.add}</LoadingButton> : null}
      {channelListings.map((channelListing) => (
        <ChannelListingRow canWrite={canWrite} channelListing={channelListing} key={channelListing.id} />
      ))}
    </ScrollView>
  );
}

export default function ListingChannelsScreen({ id }: { id: string }) {
  return <ListingGate id={id}>{() => <ChannelsBody id={id} />}</ListingGate>;
}
