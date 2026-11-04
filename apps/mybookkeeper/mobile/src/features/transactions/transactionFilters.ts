import type { TransactionListParams } from "@mybookkeeper/api-client/types/transaction/TransactionListParams";
import { NO_FILTERS, TRANSACTION_PERIODS, UNASSIGNED_PROPERTY } from "../../constants/transactionFilters";
import type { MoneyParams } from "../../types/MoneyParams";
import type { TransactionFilters } from "../../types/TransactionFilters";
import type { TransactionPeriod } from "../../types/TransactionPeriod";

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function periodRange(period: TransactionPeriod, today: Date): { start_date?: string; end_date?: string } {
  const year = today.getFullYear();
  const month = today.getMonth();
  switch (period) {
    case "thisMonth":
      return { start_date: isoDate(new Date(year, month, 1)), end_date: isoDate(new Date(year, month + 1, 0)) };
    case "lastMonth":
      return { start_date: isoDate(new Date(year, month - 1, 1)), end_date: isoDate(new Date(year, month, 0)) };
    case "thisYear":
      return { start_date: `${year}-01-01`, end_date: `${year}-12-31` };
    case "lastYear":
      return { start_date: `${year - 1}-01-01`, end_date: `${year - 1}-12-31` };
    case "all":
      return {};
  }
}

export function toListParams(filters: TransactionFilters, today: Date): TransactionListParams {
  const params: TransactionListParams = {};
  if (filters.view === "review") {
    // Something waiting for review is waiting whatever month it's from.
    params.to_review = true;
  } else {
    Object.assign(params, periodRange(filters.period, today));
    if (filters.approvedOnly) params.status = "approved";
  }
  if (filters.type) params.transaction_type = filters.type;
  if (filters.category) params.category = filters.category;
  if (filters.propertyId === UNASSIGNED_PROPERTY) params.unassigned = true;
  else if (filters.propertyId) params.property_id = filters.propertyId;
  const term = filters.vendor.trim();
  if (term) params.vendor = term;
  return params;
}

export function activeFilterCount(filters: TransactionFilters): number {
  return [filters.view !== "review" && filters.period !== "all", filters.view !== "review" && filters.approvedOnly, filters.type, filters.propertyId, filters.category].filter(Boolean).length;
}

export function filtersFromParams(params: Partial<MoneyParams>): TransactionFilters {
  const period = TRANSACTION_PERIODS.find((option) => option.value === params.period)?.value;
  return {
    view: params.view === "review" ? "review" : "all",
    period: period ?? NO_FILTERS.period,
    type: params.type === "income" || params.type === "expense" ? params.type : null,
    propertyId: params.property || null,
    category: params.category || null,
    vendor: params.vendor ?? "",
    approvedOnly: params.status === "approved",
  };
}

export function filtersToParams(filters: TransactionFilters): Omit<MoneyParams, "segment" | "filter"> {
  return {
    view: filters.view,
    period: filters.period,
    type: filters.type ?? "",
    property: filters.propertyId ?? "",
    category: filters.category ?? "",
    vendor: filters.vendor,
    status: filters.approvedOnly ? "approved" : "",
  };
}

/** What the detail screen needs to walk the same filtered list the person is looking at. */
export function reviewLink(id: string, filters: TransactionFilters): string {
  const query = new URLSearchParams({ review: "1" });
  if (filters.type) query.set("type", filters.type);
  if (filters.propertyId) query.set("property", filters.propertyId);
  if (filters.category) query.set("category", filters.category);
  if (filters.vendor.trim()) query.set("vendor", filters.vendor.trim());
  return `/transactions/${id}?${query.toString()}`;
}

export function reviewQueueParams(params: Partial<MoneyParams>, today: Date): TransactionListParams {
  return toListParams({ ...filtersFromParams(params), view: "review" }, today);
}

export function isWholeReviewQueue(params: TransactionListParams): boolean {
  return Object.keys(params).length === 1;
}

/** Every filter is spelled out, so a link never inherits what the Money tab last showed. */
export function transactionsLink(filters: TransactionFilters): string {
  const query = new URLSearchParams({ segment: "transactions", ...filtersToParams(filters) });
  return `/money?${query.toString()}`;
}
