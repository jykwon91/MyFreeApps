import type { ChannelListingFormGateProps } from "../../types/ChannelListingFormGateProps";
import ChannelListingFormLoader from "./ChannelListingFormLoader";
import ListingGate from "./ListingGate";

/** Adding or editing a channel link: needs the listing, its channel links and the channel list to all have loaded. */
export default function ChannelListingFormGate(props: ChannelListingFormGateProps) {
  return <ListingGate id={props.id} requireWrite>{() => <ChannelListingFormLoader {...props} />}</ListingGate>;
}
