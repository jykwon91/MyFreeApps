/** Query args for GET /discover; omitted fields take the endpoint's defaults. */
export interface DiscoveredJobListArgs {
  state?: "inbox" | "saved" | "all";
  limit?: number;
  offset?: number;
  source_id?: string;
}
