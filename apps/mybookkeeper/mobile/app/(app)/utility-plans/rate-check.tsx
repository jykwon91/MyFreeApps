import { Stack } from "expo-router";
import UtilityRateCheckScreen from "../../../src/features/utilityPlans/UtilityRateCheckScreen";

export default function UtilityRateCheckRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Rate check", headerBackTitle: "Utility Plans" }} />
      <UtilityRateCheckScreen />
    </>
  );
}
