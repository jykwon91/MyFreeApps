import { Stack } from "expo-router";
import NewTransactionScreen from "../../../src/features/transactions/NewTransactionScreen";

export default function NewTransactionRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "New transaction", headerBackTitle: "Cancel" }} />
      <NewTransactionScreen />
    </>
  );
}
