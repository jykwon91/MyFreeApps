import RequireWrite from "../workspace/RequireWrite";
import TransactionEditLoader from "./TransactionEditLoader";
import TransactionFormSkeleton from "./TransactionFormSkeleton";

/** Edits a transaction. A viewer is told they can't, and nothing is fetched for them. */
export default function TransactionEditScreen({ id }: { id: string }) {
  return (
    <RequireWrite loading={<TransactionFormSkeleton />}>
      <TransactionEditLoader id={id} />
    </RequireWrite>
  );
}
