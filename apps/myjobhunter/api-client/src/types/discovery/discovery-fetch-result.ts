/** Returned by POST /discover/sources/{id}/refresh. */
export interface DiscoveryFetchResult {
  fetch_id: string;
  status: "running" | "success" | "partial" | "error";
  fetched_count: number;
  new_count: number;
  updated_count: number;
  duration_ms: number | null;
  error_message: string | null;
}
