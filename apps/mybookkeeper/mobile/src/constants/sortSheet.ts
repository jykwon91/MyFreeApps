import type { SortDirectionOption } from "../types/SortDirectionOption";

export const SORT_SHEET = {
  sortBy: "Sort by",
  order: "Order",
} as const;

export const SORT_DIRECTIONS: readonly SortDirectionOption[] = [
  { value: "asc", label: "Ascending" },
  { value: "desc", label: "Descending" },
];
