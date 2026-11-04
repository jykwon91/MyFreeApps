import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";
import type { TransactionFilters } from "../types/TransactionFilters";
import type { TransactionPeriod } from "../types/TransactionPeriod";
import type { TransactionView } from "../types/TransactionView";

export const UNASSIGNED_PROPERTY = "unassigned";
export const SEARCH_DEBOUNCE_MS = 300;

export const NO_FILTERS: TransactionFilters = {
  view: "all",
  period: "all",
  type: null,
  propertyId: null,
  category: null,
  vendor: "",
  approvedOnly: false,
};

export const TRANSACTION_VIEWS: readonly { value: TransactionView; label: string }[] = [
  { value: "all", label: "All" },
  { value: "review", label: "To review" },
];

export const TRANSACTION_PERIODS: readonly { value: TransactionPeriod; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "thisYear", label: "This year" },
  { value: "lastYear", label: "Last year" },
];

export const TRANSACTION_TYPES: readonly { value: TransactionType; label: string }[] = [
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
];
