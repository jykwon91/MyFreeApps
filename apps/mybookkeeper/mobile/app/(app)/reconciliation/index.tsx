import { Stack } from "expo-router";
import ReconciliationScreen from "../../../src/features/reconciliation/ReconciliationScreen";

export default function ReconciliationRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Reconciliation", headerBackTitle: "More" }} />
      <ReconciliationScreen />
    </>
  );
}
