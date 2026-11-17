import { Stack, useLocalSearchParams } from "expo-router";
import UtilityPlanDetailScreen from "../../../../src/features/utilityPlans/UtilityPlanDetailScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function UtilityPlanRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Plan", headerBackTitle: "Utility Plans" }} />
      <ValidRoute uuids={["id"]}>
        <UtilityPlanDetailScreen id={id} />
      </ValidRoute>
    </>
  );
}
