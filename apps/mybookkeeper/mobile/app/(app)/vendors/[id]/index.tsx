import { Stack, useLocalSearchParams } from "expo-router";
import VendorDetailScreen from "../../../../src/features/vendors/VendorDetailScreen";

export default function VendorRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Vendor", headerBackTitle: "Vendors" }} />
      <VendorDetailScreen id={id} />
    </>
  );
}
