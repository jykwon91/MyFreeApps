import { Stack, useLocalSearchParams } from "expo-router";
import ChannelListingFormGate from "../../../../../src/features/listings/ChannelListingFormGate";
import ValidRoute from "../../../../../src/features/routing/ValidRoute";

export default function ChannelNewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Add a channel", headerBackTitle: "Back" }} />
      <ValidRoute uuids={["id"]}>
        <ChannelListingFormGate id={id} />
      </ValidRoute>
    </>
  );
}
