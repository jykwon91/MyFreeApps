import { Stack, useLocalSearchParams } from "expo-router";
import ListingChannelsScreen from "../../../../../src/features/listings/ListingChannelsScreen";
import ValidRoute from "../../../../../src/features/routing/ValidRoute";

export default function ChannelsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Channels", headerBackTitle: "Back" }} />
      <ValidRoute uuids={["id"]}>
        <ListingChannelsScreen id={id} />
      </ValidRoute>
    </>
  );
}
