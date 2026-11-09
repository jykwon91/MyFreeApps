import { Stack } from "expo-router";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../../src/constants/moneyAnalysis";
import MoneyAnalysisScreen from "../../../src/features/moneyAnalysis/MoneyAnalysisScreen";

export default function MoneyAnalysisRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: MESSAGES.title, headerBackTitle: MESSAGES.backTitle }} />
      <MoneyAnalysisScreen />
    </>
  );
}
