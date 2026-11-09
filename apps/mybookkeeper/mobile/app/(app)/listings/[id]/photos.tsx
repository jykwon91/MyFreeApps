import { Stack, useLocalSearchParams } from "expo-router";
import ListingPhotosScreen from "../../../../src/features/listings/ListingPhotosScreen";

export default function ListingPhotosRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Photos", headerBackTitle: "Listing" }} />
      <ListingPhotosScreen id={id} />
    </>
  );
}
