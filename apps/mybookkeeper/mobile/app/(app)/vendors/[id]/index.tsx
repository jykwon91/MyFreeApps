import { Stack, useLocalSearchParams } from "expo-router";
import VendorDetailScreen from "../../../../src/features/vendors/VendorDetailScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function VendorRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Vendor", headerBackTitle: "Vendors" }} />
      <ValidRoute uuids={["id"]}>
        <VendorDetailScreen id={id} />
      </ValidRoute>
    </>
  );
}
