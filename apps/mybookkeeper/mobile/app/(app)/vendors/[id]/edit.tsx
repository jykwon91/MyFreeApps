import { Stack, useLocalSearchParams } from "expo-router";
import VendorEditScreen from "../../../../src/features/vendors/VendorEditScreen";

export default function VendorEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit vendor", headerBackTitle: "Vendor" }} />
      <VendorEditScreen id={id} />
    </>
  );
}
