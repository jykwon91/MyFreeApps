import { Stack, useLocalSearchParams } from "expo-router";
import LeaseValuesScreen from "../../../../src/features/leases/LeaseValuesScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function LeaseDetailsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Lease details", headerBackTitle: "Lease" }} />
      <ValidRoute uuids={["id"]}>
        <LeaseValuesScreen id={id} />
      </ValidRoute>
    </>
  );
}
