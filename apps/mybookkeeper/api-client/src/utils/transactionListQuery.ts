import type { TransactionListParams } from "../types/transaction/TransactionListParams";
import { queryString } from "./queryString";

type TransactionQuery = Record<keyof TransactionListParams, string | readonly string[] | undefined>;

function optionalString(value: number | boolean | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

/**
 * The query string of the list's filters and order, with list filters as repeated keys
 * (`statuses=a&statuses=b`), which is how the backend reads them. Typed over every key,
 * so a filter added to the list can't be left out here.
 */
export function transactionListQuery(params: TransactionListParams): string {
  const query: TransactionQuery = {
    property_id: params.property_id,
    unassigned: params.unassigned ? "true" : undefined,
    applicant_id: params.applicant_id,
    status: params.status,
    to_review: params.to_review ? "true" : undefined,
    transaction_type: params.transaction_type,
    category: params.category,
    vendor: params.vendor,
    start_date: params.start_date,
    end_date: params.end_date,
    tax_year: optionalString(params.tax_year),
    tax_relevant: optionalString(params.tax_relevant),
    summary_kind: params.summary_kind,
    active_properties_only: params.active_properties_only ? "true" : undefined,
    statuses: params.statuses,
    transaction_types: params.transaction_types,
    categories: params.categories,
    property_ids: params.property_ids,
    sort_by: params.sort_by,
    sort_dir: params.sort_dir,
    sort: params.sort,
    limit: optionalString(params.limit),
  };
  return queryString(query);
}
