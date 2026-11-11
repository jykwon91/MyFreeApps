import { Stack } from "expo-router";
import { ANALYZE_MESSAGES as MESSAGES } from "../../src/constants/analyze";
import AnalyzeScreen from "../../src/features/analyze/AnalyzeScreen";

export default function AnalyzeRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: MESSAGES.screenTitle }} />
      <AnalyzeScreen />
    </>
  );
}
