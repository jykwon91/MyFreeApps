import { Stack } from "expo-router";
import { DRILL_DOWN_MESSAGES as MESSAGES } from "../../../src/constants/moneyAnalysis";
import DrillDownScreen from "../../../src/features/drillDown/DrillDownScreen";

export default function DrillDownRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: MESSAGES.title, headerBackTitle: MESSAGES.backTitle }} />
      <DrillDownScreen />
    </>
  );
}
