import { UNASSIGNED_PROPERTY_ID } from "../constants/unassignedProperty";
import { amountToCents } from "./amountToCents";
import type { DrillDownFilter } from "../types/analytics/drill-down-filter";
import type { TransactionListPage } from "../types/transaction/TransactionListPage";
import type { TransactionListParams } from "../types/transaction/TransactionListParams";

/**
 * The approved transactions behind a number, cut the way the summary cut them: approved rows in the
 * range, in every property (a deactivated one's history still counts), with revenue and expenses told apart by category rather than by the
 * transaction's income or expense type. Every part of the filter goes to the server, so its count and
 * total cover every matching row. The Unassigned bucket has no property by definition, so a property
 * allowlist would always empty it and is left off.
 */
export function drillDownListParams(filter: DrillDownFilter): TransactionListParams {
  const isUnassigned = filter.propertyId === UNASSIGNED_PROPERTY_ID;
  return {
    category: filter.category,
    property_id: isUnassigned ? undefined : filter.propertyId,
    unassigned: isUnassigned ? true : undefined,
    property_ids: isUnassigned ? undefined : filter.propertyIds,
    categories: filter.categories,
    start_date: filter.startDate,
    end_date: filter.endDate,
    status: "approved",
    summary_kind: filter.type,
  };
}

/** What every matching row adds up to, from the latest page; exactly zero, never negative zero, before one loads. */
export function drillDownAmountTotal(pages: readonly TransactionListPage[]): number {
  const cents = pages.length > 0 ? amountToCents(pages[pages.length - 1].amount_total) : 0;
  return cents === 0 ? 0 : cents / 100;
}
