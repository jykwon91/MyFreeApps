/** Body for POST /discover/sources. */
export interface DiscoverySourceCreate {
  source: string;
  config: Record<string, unknown>;
  fetch_interval_minutes?: number;
}
