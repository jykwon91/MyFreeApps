import { UNASSIGNED_PROPERTY_ID } from "../constants/unassignedProperty";
import type { DrillDownFilter } from "../types/analytics/drill-down-filter";
import type { Transaction } from "../types/transaction/transaction";
import type { TransactionListParams } from "../types/transaction/TransactionListParams";

/** The approved transactions behind a number: the same rows the summary counted. */
export function drillDownListParams(filter: DrillDownFilter): TransactionListParams {
  const isUnassigned = filter.propertyId === UNASSIGNED_PROPERTY_ID;
  return {
    category: filter.category,
    property_id: isUnassigned ? undefined : filter.propertyId,
    unassigned: isUnassigned ? true : undefined,
    start_date: filter.startDate,
    end_date: filter.endDate,
    status: "approved",
  };
}

/**
 * Narrows what the list returned to the rest of the filter. The list takes one property and no
 * type of revenue or expense, so those are applied here. The Unassigned bucket has no property by
 * definition, so a property allowlist would always empty it.
 */
export function filterDrillDownTransactions(transactions: readonly Transaction[], filter: DrillDownFilter): Transaction[] {
  const isUnassigned = filter.propertyId === UNASSIGNED_PROPERTY_ID;
  let rows = [...transactions];
  if (filter.type) {
    const type = filter.type === "revenue" ? "income" : "expense";
    rows = rows.filter((transaction) => transaction.transaction_type === type);
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
