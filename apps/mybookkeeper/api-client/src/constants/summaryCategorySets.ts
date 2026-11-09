import { EXPENSE_CATEGORY_LIST, REVENUE_CATEGORIES } from "./transactionCategories";

/** What the summary adds up as revenue: the categories, not the transaction's income or expense type. */
export const REVENUE_CATEGORY_SET: ReadonlySet<string> = new Set(REVENUE_CATEGORIES);

/** What the summary adds up as expenses. */
export const EXPENSE_CATEGORY_SET: ReadonlySet<string> = new Set(EXPENSE_CATEGORY_LIST);
