import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";

export default function TransactionTypeBadge({ type }: { type: TransactionType }) {
  return type === "income" ? (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
      Income
    </span>
  ) : (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
      Expense
    </span>
  );
}
