import { Stack } from "expo-router";
import UtilityPlansScreen from "../../../src/features/utilityPlans/UtilityPlansScreen";

export default function UtilityPlansRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Utility Plans", headerBackTitle: "More" }} />
      <UtilityPlansScreen />
    </>
  );
}
