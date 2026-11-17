import { Stack, useLocalSearchParams } from "expo-router";
import ListingLinkCreateScreen from "../../../../../src/features/listings/ListingLinkCreateScreen";
import ValidRoute from "../../../../../src/features/routing/ValidRoute";

export default function LinkNewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Add a link", headerBackTitle: "Back" }} />
      <ValidRoute uuids={["id"]}>
        <ListingLinkCreateScreen id={id} />
      </ValidRoute>
    </>
  );
}
