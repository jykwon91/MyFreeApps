import { Stack, useLocalSearchParams } from "expo-router";
import LeaseDetailScreen from "../../../../src/features/leases/LeaseDetailScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function LeaseRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Lease" }} />
      <ValidRoute uuids={["id"]}>
        <LeaseDetailScreen id={id} />
      </ValidRoute>
    </>
  );
}
