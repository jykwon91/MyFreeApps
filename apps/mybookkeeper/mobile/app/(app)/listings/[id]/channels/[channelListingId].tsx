import { Stack, useLocalSearchParams } from "expo-router";
import ChannelListingFormGate from "../../../../../src/features/listings/ChannelListingFormGate";

export default function ChannelEditRoute() {
  const { id, channelListingId } = useLocalSearchParams<{ id: string; channelListingId: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit channel", headerBackTitle: "Back" }} />
      <ChannelListingFormGate id={id} channelListingId={channelListingId} />
    </>
  );
}
