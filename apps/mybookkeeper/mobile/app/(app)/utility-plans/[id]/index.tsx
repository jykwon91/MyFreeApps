import { Stack, useLocalSearchParams } from "expo-router";
import UtilityPlanDetailScreen from "../../../../src/features/utilityPlans/UtilityPlanDetailScreen";

export default function UtilityPlanRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Plan", headerBackTitle: "Utility Plans" }} />
      <UtilityPlanDetailScreen id={id} />
    </>
  );
}
