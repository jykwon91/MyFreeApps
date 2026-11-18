import { useGetTransactionQuery } from "@mybookkeeper/api-client/store/transactionsApi";
import { EmptyState, goBackOr } from "@platform/mobile";
import TransactionEditForm from "./TransactionEditForm";
import TransactionFormSkeleton from "./TransactionFormSkeleton";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";

export default function TransactionEditLoader({ id }: { id: string }) {
  const { currentData: transaction, error, refetch } = useGetTransactionQuery(id);

  if (transaction) return <TransactionEditForm key={transaction.id} original={transaction} />;
  if (error) {
    const isGone = httpStatus(error) === 404;
    return (
      <EmptyState
        action={isGone ? { label: "Back", onPress: () => goBackOr("/money") } : { label: "Try again", onPress: () => refetch() }}
        body={isGone ? "It may have been deleted." : "Want me to try again?"}
        heading={isGone ? "I can't find that transaction." : "I couldn't load that transaction."}
      />
    );
  }
  return <TransactionFormSkeleton />;
}
