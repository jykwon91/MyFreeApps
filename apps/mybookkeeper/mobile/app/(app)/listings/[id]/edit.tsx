import { Stack, useLocalSearchParams } from "expo-router";
import ListingEditScreen from "../../../../src/features/listings/ListingEditScreen";

export default function ListingEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit listing", headerBackTitle: "Listing" }} />
      <ListingEditScreen id={id} />
    </>
  );
}
