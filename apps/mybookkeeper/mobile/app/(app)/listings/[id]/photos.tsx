import { Stack, useLocalSearchParams } from "expo-router";
import ListingPhotosScreen from "../../../../src/features/listings/ListingPhotosScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function ListingPhotosRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Photos", headerBackTitle: "Listing" }} />
      <ValidRoute uuids={["id"]}>
        <ListingPhotosScreen id={id} />
      </ValidRoute>
    </>
  );
}
