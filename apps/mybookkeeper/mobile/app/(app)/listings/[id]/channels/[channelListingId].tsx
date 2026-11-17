import { Stack, useLocalSearchParams } from "expo-router";
import ChannelListingFormGate from "../../../../../src/features/listings/ChannelListingFormGate";
import ValidRoute from "../../../../../src/features/routing/ValidRoute";

export default function ChannelEditRoute() {
  const { id, channelListingId } = useLocalSearchParams<{ id: string; channelListingId: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit channel", headerBackTitle: "Back" }} />
      <ValidRoute uuids={["id", "channelListingId"]}>
        <ChannelListingFormGate id={id} channelListingId={channelListingId} />
      </ValidRoute>
    </>
  );
}
