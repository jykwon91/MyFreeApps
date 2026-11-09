import { EXPENSE_CATEGORY_SET, REVENUE_CATEGORY_SET } from "../constants/summaryCategorySets";
import { TRANSACTION_LIST_LIMIT } from "../constants/transactionPaging";
import { UNASSIGNED_PROPERTY_ID } from "../constants/unassignedProperty";
import type { DrillDownFilter } from "../types/analytics/drill-down-filter";
import type { Transaction } from "../types/transaction/transaction";
import type { TransactionListParams } from "../types/transaction/TransactionListParams";

/**
 * The approved transactions behind a number, cut the way the summary cut them: approved rows in the
 * range, in active properties, with revenue and expenses told apart by category rather than by the
 * transaction's income or expense type. Asks for the most the server returns so the total is not cut short.
 */
export function drillDownListParams(filter: DrillDownFilter): TransactionListParams {
  const isUnassigned = filter.propertyId === UNASSIGNED_PROPERTY_ID;
  return {
    category: filter.category,
    property_id: isUnassigned ? undefined : filter.propertyId,
    unassigned: isUnassigned ? true : undefined,
    start_date: filter.startDate,
    end_date: filter.endDate,
    status: "approved",
    summary_kind: filter.type,
    active_properties_only: true,
    limit: TRANSACTION_LIST_LIMIT,
  };
}

/**
 * Narrows what the list returned to the rest of the filter. The list takes one property and one
 * category, so a set of properties or categories is applied here. The Unassigned bucket has no property by
 * definition, so a property allowlist would always empty it.
 */
export function filterDrillDownTransactions(transactions: readonly Transaction[], filter: DrillDownFilter): Transaction[] {
  const isUnassigned = filter.propertyId === UNASSIGNED_PROPERTY_ID;
  let rows = [...transactions];
  if (filter.type) {
    const inKind = filter.type === "revenue" ? REVENUE_CATEGORY_SET : EXPENSE_CATEGORY_SET;
    rows = rows.filter((transaction) => inKind.has(transaction.category));
  }
  if (filter.categories) {
    const chosen = new Set(filter.categories);
    rows = rows.filter((transaction) => chosen.has(transaction.category));
  }
  if (!isUnassigned && filter.propertyIds?.length) {
    const ids = new Set(filter.propertyIds);
    rows = rows.filter((transaction) => !!transaction.property_id && ids.has(transaction.property_id));
  }
  return rows;
}

/** What the rows add up to; amounts can arrive as text. */
export function drillDownTotal(transactions: readonly Transaction[]): number {
  return transactions.reduce((sum, transaction) => {
    const amount = typeof transaction.amount === "string" ? parseFloat(transaction.amount) || 0 : transaction.amount;
    return sum + amount;
  }, 0);
}

/** The server stops at its limit, so a list that long may be missing rows. */
export function isDrillDownTruncated(rows: readonly Transaction[]): boolean {
  return rows.length >= TRANSACTION_LIST_LIMIT;
}
