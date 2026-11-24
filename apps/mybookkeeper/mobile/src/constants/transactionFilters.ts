import { DEFAULT_TRANSACTION_SORT_DIRECTION, DEFAULT_TRANSACTION_SORT_FIELD } from "@mybookkeeper/api-client/constants/transactionSort";
import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";
import { TRANSACTION_TYPES as ALL_TRANSACTION_TYPES, TRANSACTION_TYPE_LABELS } from "@mybookkeeper/api-client/constants/transactionTypes";
import type { TransactionFilters } from "../types/TransactionFilters";
import type { TransactionPeriod } from "../types/TransactionPeriod";
import type { TransactionView } from "../types/TransactionView";

export const UNASSIGNED_PROPERTY = "unassigned";
/** A day as the API writes it, "YYYY-MM-DD". */
export const DAY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const SEARCH_DEBOUNCE_MS = 300;
/** A month as the API writes it, "YYYY-MM". */
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const NO_FILTERS: TransactionFilters = {
  view: "all",
  period: "all",
  month: null,
  startDate: null,
  endDate: null,
  type: null,
  propertyId: null,
  category: null,
  vendor: "",
  status: null,
  taxRelevant: null,
  sortBy: DEFAULT_TRANSACTION_SORT_FIELD,
  sortDir: DEFAULT_TRANSACTION_SORT_DIRECTION,
};

export const STATUS_FILTER = {
  title: "Status",
  any: "Any status",
} as const;

export const TAX_FILTER = {
  title: "In your tax report",
  either: "Either",
  included: "In tax report",
  leftOut: "Not in tax report",
} as const;

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

/** How the list's summary line names a type filter. */
export const TYPE_FILTER_SUMMARY: Record<TransactionType, string> = {
  income: "Income",
  expense: "Expenses",
  transfer: "Transfers",
};

export const TRANSACTION_TYPES: readonly { value: TransactionType; label: string }[] = ALL_TRANSACTION_TYPES.map(
  (value) => ({ value, label: TRANSACTION_TYPE_LABELS[value] }),
);
