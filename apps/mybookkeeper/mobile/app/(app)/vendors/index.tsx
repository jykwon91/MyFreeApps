import { Stack } from "expo-router";
import VendorsScreen from "../../../src/features/vendors/VendorsScreen";

export default function VendorsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Vendors", headerBackTitle: "More" }} />
      <VendorsScreen />
    </>
  );
}
