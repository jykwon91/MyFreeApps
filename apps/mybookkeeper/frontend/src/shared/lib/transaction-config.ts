import { EXPENSE_CATEGORY_LIST } from "@/shared/lib/constants";
import type { Filters } from "@/shared/types/transaction/transaction-filters";
import type { TransactionStatus } from "@/shared/types/transaction/transaction";

export const EMPTY_FILTERS: Filters = {
  property_id: "",
  status: "",
  transaction_type: "",
  category: "",
  vendor: "",
  start_date: "",
  end_date: "",
};

export const STATUS_OPTIONS = ["pending", "approved", "needs_review", "duplicate", "unverified"] as const;

// Statuses that can be promoted to "approved" via the inline ✓ / bulk Approve
// actions (the row must also have a property assigned). Mirrors the backend
// allowlist in transaction_bulk_repo.bulk_approve.
export const APPROVABLE_STATUSES: readonly TransactionStatus[] = [
  "pending",
  "needs_review",
  "unverified",
];

export const TYPE_OPTIONS = ["income", "expense"] as const;

export const ALL_CATEGORIES = ["rental_revenue", "cleaning_fee_revenue", ...EXPENSE_CATEGORY_LIST] as const;
