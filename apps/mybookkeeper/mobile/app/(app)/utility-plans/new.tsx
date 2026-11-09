import { Stack } from "expo-router";
import { UTILITY_PLAN_FORM_MESSAGES } from "../../../src/constants/utilityPlanForm";
import UtilityPlanFormScreen from "../../../src/features/utilityPlans/UtilityPlanFormScreen";

export default function UtilityPlanNewRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: UTILITY_PLAN_FORM_MESSAGES.titleNew, headerBackTitle: "Utility Plans" }} />
      <UtilityPlanFormScreen />
    </>
  );
}
