import type { TransactionType } from "../types/transaction/TransactionType";
import { EXPENSE_CATEGORY_LIST, INCOME_CATEGORIES, TRANSFER_CATEGORY } from "./transactionCategories";

/** Every type, in picker order. A transfer is money moved between your own accounts: neither income nor expense. */
export const TRANSACTION_TYPES: readonly TransactionType[] = ["income", "expense", "transfer"];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
};

/** The categories each type can carry. A transfer has exactly one. */
export const CATEGORIES_FOR_TYPE: Record<TransactionType, readonly string[]> = {
  income: INCOME_CATEGORIES,
  expense: EXPENSE_CATEGORY_LIST,
  transfer: [TRANSFER_CATEGORY],
};

/** What the category switches to when the type changes. */
export const DEFAULT_CATEGORY_FOR_TYPE: Record<TransactionType, string> = {
  income: "rental_revenue",
  expense: "maintenance",
  transfer: TRANSFER_CATEGORY,
};
