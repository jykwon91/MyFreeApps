import { Stack, useLocalSearchParams } from "expo-router";
import ChannelListingFormGate from "../../../../../src/features/listings/ChannelListingFormGate";

export default function ChannelNewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Add a channel", headerBackTitle: "Back" }} />
      <ChannelListingFormGate id={id} />
    </>
  );
}
