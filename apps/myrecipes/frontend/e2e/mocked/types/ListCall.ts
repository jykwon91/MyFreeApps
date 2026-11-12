/** The filters one GET /recipes call carried; null when the query parameter was absent. */
export interface ListCall {
  search: string | null;
  owner: string | null;
}
