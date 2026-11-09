import { Stack, useLocalSearchParams } from "expo-router";
import ReconciliationDetailScreen from "../../../src/features/reconciliation/ReconciliationDetailScreen";
import { formYear } from "../../../src/features/reconciliation/reconciliationDisplay";

export default function ReconciliationDetailRoute() {
  const { id, year } = useLocalSearchParams<{ id: string; year?: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "1099", headerBackTitle: "Reconciliation" }} />
      <ReconciliationDetailScreen id={id} year={formYear(year, new Date())} />
    </>
  );
}
