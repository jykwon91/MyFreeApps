import { Stack, useLocalSearchParams } from "expo-router";
import ListingDetailScreen from "../../../../src/features/listings/ListingDetailScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function ListingRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Listing", headerBackTitle: "Listings" }} />
      <ValidRoute uuids={["id"]}>
        <ListingDetailScreen id={id} />
      </ValidRoute>
    </>
  );
}
