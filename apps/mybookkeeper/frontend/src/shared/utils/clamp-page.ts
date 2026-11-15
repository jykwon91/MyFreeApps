import type { PaginationState } from "@tanstack/react-table";

/** The same pagination, moved back to the last page when it points past the end of `total` rows. */
export function clampPage(pagination: PaginationState, total: number | null): PaginationState {
  if (total === null) return pagination;
  const lastPageIndex = Math.max(0, Math.ceil(total / pagination.pageSize) - 1);
  return pagination.pageIndex > lastPageIndex ? { ...pagination, pageIndex: lastPageIndex } : pagination;
}
