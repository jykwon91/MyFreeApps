import type { PaginationState } from "@tanstack/react-table";
import { EXPENSE_CATEGORY_LIST } from "@/shared/lib/constants";
import { TRANSFER_CATEGORY } from "@mybookkeeper/api-client/constants/transactionCategories";
import { TRANSACTION_TYPES } from "@mybookkeeper/api-client/constants/transactionTypes";
import type { Filters } from "@/shared/types/transaction/transaction-filters";
import type { TransactionStatus } from "@mybookkeeper/api-client/types/transaction/TransactionStatus";

export const EMPTY_FILTERS: Filters = {
  property_id: "",
  account_id: "",
  status: "",
  transaction_type: "",
  category: "",
  vendor: "",
  start_date: "",
  end_date: "",
  transaction_scope: "",
};

/** The transactions table opens on its first page of 25 rows. */
export const INITIAL_TRANSACTION_PAGINATION: PaginationState = { pageIndex: 0, pageSize: 25 };

// Statuses that can be promoted to "approved" via the inline ✓ / bulk Approve
// actions (the row must also have a property assigned). Mirrors the backend
// allowlist in transaction_bulk_repo.bulk_approve.
export const APPROVABLE_STATUSES: readonly TransactionStatus[] = [
  "pending",
  "needs_review",
  "unverified",
];

export const TYPE_OPTIONS = TRANSACTION_TYPES;

export const ALL_CATEGORIES = ["rental_revenue", "cleaning_fee_revenue", ...EXPENSE_CATEGORY_LIST, TRANSFER_CATEGORY] as const;
