import { Stack, useLocalSearchParams } from "expo-router";
import VendorRuleDetailScreen from "../../../src/features/vendorRules/VendorRuleDetailScreen";
import ValidRoute from "../../../src/features/routing/ValidRoute";

export default function VendorRuleRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Vendor rule", headerBackTitle: "Vendor rules" }} />
      <ValidRoute uuids={["id"]}>
        <VendorRuleDetailScreen id={id} />
      </ValidRoute>
    </>
  );
}
