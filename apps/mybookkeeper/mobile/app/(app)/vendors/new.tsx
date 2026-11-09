import { Stack } from "expo-router";
import VendorCreateScreen from "../../../src/features/vendors/VendorCreateScreen";

export default function VendorNewRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "New vendor", headerBackTitle: "Vendors" }} />
      <VendorCreateScreen />
    </>
  );
}
