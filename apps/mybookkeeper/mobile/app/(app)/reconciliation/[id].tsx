import { Stack, useLocalSearchParams } from "expo-router";
import { RECONCILIATION_MESSAGES as MESSAGES } from "../../../src/constants/reconciliation";
import ReconciliationDetailScreen from "../../../src/features/reconciliation/ReconciliationDetailScreen";
import { formYear } from "../../../src/features/reconciliation/reconciliationDisplay";
import ValidRoute from "../../../src/features/routing/ValidRoute";

export default function ReconciliationDetailRoute() {
  const { id, year } = useLocalSearchParams<{ id: string; year?: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: MESSAGES.detailTitle, headerBackTitle: MESSAGES.listTitle }} />
      <ValidRoute uuids={["id"]}>
        <ReconciliationDetailScreen id={id} year={formYear(year, new Date())} />
      </ValidRoute>
    </>
  );
}
