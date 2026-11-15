import type { ColumnFiltersState, SortingState } from "@tanstack/react-table";
import type { TransactionListParams } from "@mybookkeeper/api-client/types/transaction/TransactionListParams";
import type { TransactionSortField } from "@mybookkeeper/api-client/types/transaction/TransactionSortField";
import type { TransactionSortKey } from "@mybookkeeper/api-client/types/transaction/TransactionSortKey";
import { SERVER_SORTABLE_TRANSACTION_COLUMNS } from "@/shared/lib/transaction-sort-columns";
import { isTransactionStatus, isTransactionType } from "@/shared/utils/transaction-value-guards";
import type { Filters } from "@/shared/types/transaction/transaction-filters";

function isServerSortable(columnId: string): columnId is TransactionSortField {
  return SERVER_SORTABLE_TRANSACTION_COLUMNS.some((field) => field === columnId);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item !== "") : [];
}

function dateRange(value: unknown): [string, string] {
  if (!Array.isArray(value)) return ["", ""];
  const [from, to]: unknown[] = value;
  return [typeof from === "string" ? from : "", typeof to === "string" ? to : ""];
}

function laterDate(a: string, b: string): string {
  return a > b ? a : b;
}

function earlierDate(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/** What the filter bar narrows the list to. The table's Category filter offers the categories of these rows. */
export function toFilterBarParams(filters: Filters): TransactionListParams {
  const params: TransactionListParams = {};
  if (filters.property_id) params.property_id = filters.property_id;
  if (filters.status) params.status = filters.status;
  if (filters.transaction_type) params.transaction_type = filters.transaction_type;
  if (filters.category) params.category = filters.category;
  if (filters.vendor) params.vendor = filters.vendor;
  if (filters.start_date) params.start_date = filters.start_date;
  if (filters.end_date) params.end_date = filters.end_date;
  return params;
}

/**
 * What GET /transactions/page (and the export) is asked for: the filter bar's choices, narrowed by
 * the table's column filters, in the table's order (every shift-clicked column, most significant
 * first). A column filter narrows on top of the filter bar, so the two date ranges meet in the middle.
 */
export function toTransactionListParams(
  filters: Filters,
  columnFilters: ColumnFiltersState,
  sorting: SortingState,
): TransactionListParams {
  const params = toFilterBarParams(filters);
  for (const { id, value } of columnFilters) {
    const values = stringList(value);
    if (id === "status") params.statuses = values.filter(isTransactionStatus);
    else if (id === "transaction_type") params.transaction_types = values.filter(isTransactionType);
    else if (id === "category") params.categories = values;
    else if (id === "property_id") params.property_ids = values;
    else if (id === "tax_relevant" && values.length === 1) params.tax_relevant = values[0] === "true";
    else if (id === "transaction_date") {
      const [from, to] = dateRange(value);
      const start = laterDate(params.start_date ?? "", from);
      const end = earlierDate(params.end_date ?? "", to);
      if (start) params.start_date = start;
      if (end) params.end_date = end;
    }
  }
  const sort: TransactionSortKey[] = [];
  for (const { id, desc } of sorting) {
    if (isServerSortable(id)) sort.push(`${id}:${desc ? "desc" : "asc"}`);
  }
  if (sort.length) params.sort = sort;
  return params;
}
