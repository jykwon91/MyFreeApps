import { Stack, useLocalSearchParams } from "expo-router";
import ListingLinksScreen from "../../../../../src/features/listings/ListingLinksScreen";
import ValidRoute from "../../../../../src/features/routing/ValidRoute";

export default function LinksRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Other sites", headerBackTitle: "Back" }} />
      <ValidRoute uuids={["id"]}>
        <ListingLinksScreen id={id} />
      </ValidRoute>
    </>
  );
}
