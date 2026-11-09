import { useGetChannelsQuery, useGetListingChannelsQuery } from "@mybookkeeper/api-client/store/listingsApi";
import type { ChannelListing } from "@mybookkeeper/api-client/types/listing/channel-listing";
import { EmptyState } from "@platform/mobile";
import { LISTING_CHANNEL_MESSAGES as MESSAGES } from "../../constants/listingChannels";
import ChannelListingFormScreen from "./ChannelListingFormScreen";
import ListingDetailSkeleton from "./ListingDetailSkeleton";
import ListingGate from "./ListingGate";

interface ChannelListingFormGateProps {
  id: string;
  /** Set to change that channel link; unset to add one. */
  channelListingId?: string;
}

function FormLoader({ id, channelListingId }: ChannelListingFormGateProps) {
  const channels = useGetChannelsQuery();
  const linked = useGetListingChannelsQuery(id);

  if (!channels.currentData || !linked.currentData) {
    if (channels.isFetching || linked.isFetching || (!channels.error && !linked.error)) return <ListingDetailSkeleton />;
    return (
      <EmptyState
        action={{
          label: MESSAGES.tryAgain,
          onPress: () => {
            void channels.refetch();
            void linked.refetch();
          },
        }}
        body={MESSAGES.tryAgainOffer}
        heading={MESSAGES.channelsFailed}
      />
    );
  }
  const original: ChannelListing | null = channelListingId ? (linked.currentData.find((candidate) => candidate.id === channelListingId) ?? null) : null;
  if (channelListingId && !original) return <EmptyState body={MESSAGES.tryAgainOffer} heading={MESSAGES.alreadyRemoved} />;
  const taken = new Set(linked.currentData.map((candidate) => candidate.channel_id));
  return <ChannelListingFormScreen available={channels.currentData.filter((channel) => !taken.has(channel.id))} key={original?.id ?? "new"} listingId={id} original={original} />;
}

/** Adding or editing a channel link: needs the listing, its channel links and the channel list to all have loaded. */
export default function ChannelListingFormGate(props: ChannelListingFormGateProps) {
  return <ListingGate id={props.id} requireWrite>{() => <FormLoader {...props} />}</ListingGate>;
}
