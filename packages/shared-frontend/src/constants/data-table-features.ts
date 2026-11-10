import {
  tableFeatures,
  rowSortingFeature,
  rowPaginationFeature,
  createSortedRowModel,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
} from "@tanstack/react-table";

// Sorting and pagination are the only table behaviours DataTable offers.
// The built-in comparators are registered by name so `sortFn: "auto"` — the
// default for every column — resolves the same way it did before v9 made the
// registry explicit.
export const DATA_TABLE_FEATURES = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
});
