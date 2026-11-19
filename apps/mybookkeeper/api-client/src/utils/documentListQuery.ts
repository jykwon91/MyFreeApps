import type { DocumentPageArgs } from "../types/document/DocumentPageArgs";
import { queryString } from "./queryString";

/**
 * The query string of the list's filters, with list filters as repeated keys (`statuses=a&statuses=b`),
 * which is how the backend reads them. A blank search is left out. Without the order: that's what
 * "select all" sends and is keyed on, since the order doesn't change which documents match.
 */
export function documentFilterQuery(args: DocumentPageArgs): string {
  const search = args.search.trim();
  return queryString({
    search: search || undefined,
    statuses: args.statuses,
    document_types: args.types,
    sources: args.sources,
    exclude_processing: args.excludeProcessing ? "true" : undefined,
    needs_review: args.needsReview ? "true" : undefined,
  });
}

/** The filters and the order, for a page of the list. */
export function documentListQuery(args: DocumentPageArgs): string {
  const order = queryString({ sort_by: args.sortField, sort_dir: args.sortDirection });
  return [documentFilterQuery(args), order].filter(Boolean).join("&");
}
