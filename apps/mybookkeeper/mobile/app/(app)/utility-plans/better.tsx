import { Stack } from "expo-router";
import BetterPlansScreen from "../../../src/features/utilityPlans/BetterPlansScreen";

export default function BetterPlansRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Better plans", headerBackTitle: "Utility Plans" }} />
      <BetterPlansScreen />
    </>
  );
}
