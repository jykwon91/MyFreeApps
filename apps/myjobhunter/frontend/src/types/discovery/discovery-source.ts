/** A saved-search row. Mirrors backend DiscoverySourceResponse. */
export interface DiscoverySource {
  id: string;
  source: string;
  config: Record<string, unknown>;
  is_active: boolean;
  fetch_interval_minutes: number;
  last_fetched_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
}

/** Body for POST /discover/sources. */
export interface DiscoverySourceCreate {
  source: string;
  config: Record<string, unknown>;
  fetch_interval_minutes?: number;
}
