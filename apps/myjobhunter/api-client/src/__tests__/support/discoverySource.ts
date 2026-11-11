import type { DiscoverySource } from "../../types/discovery/discovery-source";

/** A saved search as GET /discover/sources returns it: daily JSearch, never fetched. */
export function discoverySource(overrides: Partial<DiscoverySource> = {}): DiscoverySource {
  return {
    id: "s1",
    source: "jsearch",
    name: "",
    config: {},
    is_active: true,
    fetch_interval_minutes: 1440,
    last_fetched_at: null,
    last_success_at: null,
    last_error_at: null,
    last_error_message: null,
    consecutive_failures: 0,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}
