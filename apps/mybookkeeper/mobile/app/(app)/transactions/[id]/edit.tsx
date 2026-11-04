import { Stack, useLocalSearchParams } from "expo-router";
import TransactionEditScreen from "../../../../src/features/transactions/TransactionEditScreen";

export default function TransactionEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Edit transaction", headerBackTitle: "Back" }} />
      <TransactionEditScreen id={id} />
    </>
  );
}
