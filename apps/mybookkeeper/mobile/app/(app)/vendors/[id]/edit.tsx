import { Stack, useLocalSearchParams } from "expo-router";
import VendorEditScreen from "../../../../src/features/vendors/VendorEditScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function VendorEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit vendor", headerBackTitle: "Vendor" }} />
      <ValidRoute uuids={["id"]}>
        <VendorEditScreen id={id} />
      </ValidRoute>
    </>
  );
}
