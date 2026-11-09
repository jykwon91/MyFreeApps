import { Stack, useLocalSearchParams } from "expo-router";
import UtilityPlanEditScreen from "../../../../src/features/utilityPlans/UtilityPlanEditScreen";

export default function UtilityPlanEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit plan", headerBackTitle: "Plan" }} />
      <UtilityPlanEditScreen id={id} />
    </>
  );
}
