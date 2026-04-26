import { EXPENSE_CATEGORY_LIST } from "@/shared/lib/constants";
import type { Filters } from "@/shared/types/transaction/transaction-filters";

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

export const TYPE_OPTIONS = ["income", "expense"] as const;

export const ALL_CATEGORIES = ["rental_revenue", "cleaning_fee_revenue", ...EXPENSE_CATEGORY_LIST] as const;
