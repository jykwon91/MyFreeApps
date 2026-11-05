import { Stack } from "expo-router";
import ListingsScreen from "../../../src/features/listings/ListingsScreen";

export default function ListingsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Listings", headerBackTitle: "More" }} />
      <ListingsScreen />
    </>
  );
}
