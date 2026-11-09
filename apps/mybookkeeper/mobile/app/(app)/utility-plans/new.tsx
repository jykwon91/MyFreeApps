import { Stack } from "expo-router";
import UtilityPlanFormScreen from "../../../src/features/utilityPlans/UtilityPlanFormScreen";

export default function UtilityPlanNewRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Add plan", headerBackTitle: "Utility Plans" }} />
      <UtilityPlanFormScreen />
    </>
  );
}
