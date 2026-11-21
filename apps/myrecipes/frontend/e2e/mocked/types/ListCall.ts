/** The filters and page one GET /recipes call carried; null when a query parameter was absent (no cursor: the first page). */
export interface ListCall {
  search: string | null;
  owner: string | null;
  cursor: string | null;
}
