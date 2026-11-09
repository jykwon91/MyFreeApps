import { Stack, useLocalSearchParams } from "expo-router";
import ListingDetailScreen from "../../../../src/features/listings/ListingDetailScreen";

export default function ListingRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Listing", headerBackTitle: "Listings" }} />
      <ListingDetailScreen id={id} />
    </>
  );
}
