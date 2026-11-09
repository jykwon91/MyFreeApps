import { Stack, useLocalSearchParams } from "expo-router";
import { RECONCILIATION_MESSAGES as MESSAGES } from "../../../src/constants/reconciliation";
import ReconciliationAddScreen from "../../../src/features/reconciliation/ReconciliationAddScreen";
import { formYear } from "../../../src/features/reconciliation/reconciliationDisplay";

export default function ReconciliationAddRoute() {
  const { year } = useLocalSearchParams<{ year?: string }>();
  const taxYear = formYear(year, new Date());
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: `${MESSAGES.addTitle} ${taxYear}`, headerBackTitle: MESSAGES.backTitle }} />
      <ReconciliationAddScreen year={taxYear} />
    </>
  );
}
