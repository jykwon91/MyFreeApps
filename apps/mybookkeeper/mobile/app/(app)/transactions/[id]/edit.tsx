import { Stack, useLocalSearchParams } from "expo-router";
import TransactionEditScreen from "../../../../src/features/transactions/TransactionEditScreen";
import ValidRoute from "../../../../src/features/routing/ValidRoute";

export default function TransactionEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit transaction", headerBackTitle: "Back" }} />
      <ValidRoute uuids={["id"]}>
        <TransactionEditScreen id={id} />
      </ValidRoute>
    </>
  );
}
