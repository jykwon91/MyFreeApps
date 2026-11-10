/** A saved-search row. Mirrors backend DiscoverySourceResponse. */
export interface DiscoverySource {
  id: string;
  source: string;
  /** Human-readable label. Empty string when not set. */
  name: string;
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
