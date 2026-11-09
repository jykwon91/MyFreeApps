import { Stack } from "expo-router";
import { UTILITY_COSTS_MESSAGES as MESSAGES } from "../../../src/constants/analytics";
import UtilityCostsScreen from "../../../src/features/analytics/UtilityCostsScreen";

export default function AnalyticsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: MESSAGES.title, headerBackTitle: MESSAGES.backTitle }} />
      <UtilityCostsScreen />
    </>
  );
}
