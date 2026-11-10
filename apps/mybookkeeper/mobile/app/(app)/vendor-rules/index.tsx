import { Stack } from "expo-router";
import VendorRulesScreen from "../../../src/features/vendorRules/VendorRulesScreen";

export default function VendorRulesRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Vendor rules", headerBackTitle: "More" }} />
      <VendorRulesScreen />
    </>
  );
}
