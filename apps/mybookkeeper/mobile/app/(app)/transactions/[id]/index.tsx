import { Stack, useLocalSearchParams } from "expo-router";
import TransactionDetailScreen from "../../../../src/features/transactions/TransactionDetailScreen";
import { reviewQueueParams } from "../../../../src/features/transactions/transactionFilters";

export default function TransactionRoute() {
  const { id, review, ...filters } = useLocalSearchParams<{
    id: string;
    review?: string;
    type?: string;
    property?: string;
    category?: string;
    vendor?: string;
  }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Transaction", headerBackTitle: "Money" }} />
      <TransactionDetailScreen id={id} reviewQueue={review === "1" ? reviewQueueParams(filters, new Date()) : null} />
    </>
  );
}
