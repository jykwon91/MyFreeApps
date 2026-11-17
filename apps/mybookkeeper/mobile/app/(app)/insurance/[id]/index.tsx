import { Stack, useLocalSearchParams } from "expo-router";
import PolicyDetailScreen from "../../../../src/features/insurance/PolicyDetailScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function PolicyRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Policy", headerBackTitle: "Insurance" }} />
      <ValidRoute uuids={["id"]}>
        <PolicyDetailScreen id={id} />
      </ValidRoute>
    </>
  );
}
