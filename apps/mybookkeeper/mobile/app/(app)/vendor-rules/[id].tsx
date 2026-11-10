import { Stack, useLocalSearchParams } from "expo-router";
import VendorRuleDetailScreen from "../../../src/features/vendorRules/VendorRuleDetailScreen";

export default function VendorRuleRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Vendor rule", headerBackTitle: "Vendor rules" }} />
      <VendorRuleDetailScreen id={id} />
    </>
  );
}
