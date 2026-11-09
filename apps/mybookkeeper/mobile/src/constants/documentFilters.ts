import type { DocumentFilterSegment } from "../types/DocumentFilterSegment";

export const DOCUMENT_FILTERS: readonly DocumentFilterSegment[] = [
  { value: "all", label: "All" },
  { value: "needsALook", label: "Needs a look" },
];

export const DOCUMENT_FILTER_SHEET = {
  title: "Filters",
  close: "Close",
  status: "Status",
  type: "Type",
  source: "Source",
  sortBy: "Sort by",
  order: "Order",
  ascending: "Ascending",
  descending: "Descending",
  clearAll: "Clear all",
  apply: "Show results",
} as const;
