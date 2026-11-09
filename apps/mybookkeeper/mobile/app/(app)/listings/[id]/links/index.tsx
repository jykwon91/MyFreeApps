import { Stack, useLocalSearchParams } from "expo-router";
import ListingLinksScreen from "../../../../../src/features/listings/ListingLinksScreen";

export default function LinksRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Other sites", headerBackTitle: "Back" }} />
      <ListingLinksScreen id={id} />
    </>
  );
}
