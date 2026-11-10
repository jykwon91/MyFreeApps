import type { ApplicationListResponse } from "../types/application-list-response";

/** How many applications match across every page: the latest page's count, 0 before any page loads. */
export function getApplicationsTotal(pages: readonly ApplicationListResponse[] | undefined): number {
  return pages && pages.length > 0 ? pages[pages.length - 1].total : 0;
}
