import { Stack, useLocalSearchParams } from "expo-router";
import ReconciliationAddScreen from "../../../src/features/reconciliation/ReconciliationAddScreen";
import { formYear } from "../../../src/features/reconciliation/reconciliationDisplay";

export default function ReconciliationAddRoute() {
  const { year } = useLocalSearchParams<{ year?: string }>();
  const taxYear = formYear(year, new Date());
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: `Add a 1099 for ${taxYear}`, headerBackTitle: "Back" }} />
      <ReconciliationAddScreen year={taxYear} />
    </>
  );
}
