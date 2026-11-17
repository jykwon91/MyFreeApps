import { Stack, useLocalSearchParams } from "expo-router";
import ListingLinkEditScreen from "../../../../../src/features/listings/ListingLinkEditScreen";
import ValidRoute from "../../../../../src/features/routing/ValidRoute";

export default function LinkEditRoute() {
  const { id, linkId } = useLocalSearchParams<{ id: string; linkId: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit link", headerBackTitle: "Back" }} />
      <ValidRoute uuids={["id", "linkId"]}>
        <ListingLinkEditScreen id={id} linkId={linkId} />
      </ValidRoute>
    </>
  );
}
