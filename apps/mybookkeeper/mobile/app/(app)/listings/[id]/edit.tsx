import { Stack, useLocalSearchParams } from "expo-router";
import ListingEditScreen from "../../../../src/features/listings/ListingEditScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function ListingEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit listing", headerBackTitle: "Listing" }} />
      <ValidRoute uuids={["id"]}>
        <ListingEditScreen id={id} />
      </ValidRoute>
    </>
  );
}
