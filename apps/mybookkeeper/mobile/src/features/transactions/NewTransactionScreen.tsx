import RequireWrite from "../workspace/RequireWrite";
import NewTransactionForm from "./NewTransactionForm";
import TransactionFormSkeleton from "./TransactionFormSkeleton";

/** Adds a transaction by hand. A viewer is told they can't, and the form never mounts. */
export default function NewTransactionScreen() {
  return (
    <RequireWrite loading={<TransactionFormSkeleton />}>
      <NewTransactionForm />
    </RequireWrite>
  );
}
