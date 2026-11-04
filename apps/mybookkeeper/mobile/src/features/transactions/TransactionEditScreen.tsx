import { useGetTransactionQuery } from "@mybookkeeper/api-client/store/transactionsApi";
import { EmptyState, Skeleton, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { View } from "react-native";
import TransactionEditForm from "./TransactionEditForm";
import { httpStatus } from "./transactionMessages";

export default function TransactionEditScreen({ id }: { id: string }) {
  const { spacing } = useTheme();
  const { currentData: transaction, error, refetch } = useGetTransactionQuery(id);

  if (transaction) return <TransactionEditForm key={transaction.id} original={transaction} />;
  if (error) {
    const isGone = httpStatus(error) === 404;
    return (
      <EmptyState
        action={isGone ? { label: "Back", onPress: () => router.back() } : { label: "Try again", onPress: async () => { await refetch(); } }}
        body={isGone ? "It may have been deleted." : "Want me to try again?"}
        heading={isGone ? "I can't find that transaction." : "I couldn't load that transaction."}
      />
    );
  }
  return (
    <View accessibilityLabel="Loading this transaction" style={{ gap: spacing.md, padding: spacing.lg }} testID="transaction-edit-skeleton">
      <Skeleton height={48} />
      <Skeleton height={48} />
      <Skeleton height={48} />
    </View>
  );
}
