// Mirrors the 10-column table from useTransactionColumns:
// select | status | date | vendor | amount | type | category | property | tax_relevant | actions
export const TRANSACTION_SKELETON_COLUMN_WIDTHS = [
  "w-4", // select checkbox
  "w-20", // status badge
  "w-24", // date
  "w-32", // vendor
  "w-20", // amount
  "w-16", // type badge
  "w-24", // category badge
  "w-28", // property
  "w-8", // tax relevant
  "w-12", // actions
] as const;

export const TRANSACTION_SKELETON_ROW_COUNT = 15;
