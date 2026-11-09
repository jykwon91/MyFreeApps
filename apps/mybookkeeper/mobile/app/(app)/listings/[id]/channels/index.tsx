import { Stack, useLocalSearchParams } from "expo-router";
import ListingChannelsScreen from "../../../../../src/features/listings/ListingChannelsScreen";

export default function ChannelsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Channels", headerBackTitle: "Back" }} />
      <ListingChannelsScreen id={id} />
    </>
  );
}
