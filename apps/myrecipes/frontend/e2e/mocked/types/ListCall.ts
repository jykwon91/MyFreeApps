/** The filters and page one GET /recipes call carried; null when a filter's query parameter was absent. */
export interface ListCall {
  search: string | null;
  owner: string | null;
  offset: number;
}
