import { Stack, useLocalSearchParams } from "expo-router";
import { UTILITY_PLAN_FORM_MESSAGES } from "../../../../src/constants/utilityPlanForm";
import UtilityPlanEditScreen from "../../../../src/features/utilityPlans/UtilityPlanEditScreen";

export default function UtilityPlanEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: UTILITY_PLAN_FORM_MESSAGES.titleEdit, headerBackTitle: "Plan" }} />
      <UtilityPlanEditScreen id={id} />
    </>
  );
}
