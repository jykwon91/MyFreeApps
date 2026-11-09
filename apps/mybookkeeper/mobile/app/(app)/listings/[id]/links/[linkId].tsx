import { Stack, useLocalSearchParams } from "expo-router";
import ListingLinkEditScreen from "../../../../../src/features/listings/ListingLinkEditScreen";

export default function LinkEditRoute() {
  const { id, linkId } = useLocalSearchParams<{ id: string; linkId: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit link", headerBackTitle: "Back" }} />
      <ListingLinkEditScreen id={id} linkId={linkId} />
    </>
  );
}
