import { Stack, useLocalSearchParams } from "expo-router";
import LeaseDetailScreen from "../../../../src/features/leases/LeaseDetailScreen";

export default function LeaseRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Lease" }} />
      <LeaseDetailScreen id={id} />
    </>
  );
}
