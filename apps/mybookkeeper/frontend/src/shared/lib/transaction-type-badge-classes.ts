import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";

export const TRANSACTION_TYPE_BADGE_CLASSES: Record<TransactionType, string> = {
  income: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  expense: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  // Money moving between your own accounts is neither good nor bad news: neutral.
  transfer: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};
