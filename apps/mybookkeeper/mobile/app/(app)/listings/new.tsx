import { Stack } from "expo-router";
import ListingCreateScreen from "../../../src/features/listings/ListingCreateScreen";

export default function ListingNewRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "New listing", headerBackTitle: "Listings" }} />
      <ListingCreateScreen />
    </>
  );
}
