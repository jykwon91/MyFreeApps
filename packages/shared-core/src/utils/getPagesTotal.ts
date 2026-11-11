import type { PageOfItems } from "../types/paging/page-of-items";

/** How many rows match across every page: the latest page's count, 0 before any page loads. */
export function getPagesTotal(pages: readonly PageOfItems<unknown>[] | undefined): number {
  return pages && pages.length > 0 ? pages[pages.length - 1].total : 0;
}
