import { Stack } from "expo-router";
import UtilityCostsScreen from "../../../src/features/analytics/UtilityCostsScreen";

export default function AnalyticsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Utility costs", headerBackTitle: "More" }} />
      <UtilityCostsScreen />
    </>
  );
}
