import { Stack, useLocalSearchParams } from "expo-router";
import LeaseValuesScreen from "../../../../src/features/leases/LeaseValuesScreen";

export default function LeaseDetailsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Lease details", headerBackTitle: "Lease" }} />
      <LeaseValuesScreen id={id} />
    </>
  );
}
