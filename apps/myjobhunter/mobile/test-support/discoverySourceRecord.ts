import type { DiscoverySource } from "@myjobhunter/api-client/types/discovery/discovery-source";

/** A daily JSearch saved search for one role, fetched once, unless a test says otherwise. */
export function discoverySourceRecord(overrides: Partial<DiscoverySource> & Pick<DiscoverySource, "id">): DiscoverySource {
  return {
    source: "jsearch",
    name: "",
    config: { roles: ["Backend Engineer"], skills: [], country: "us", date_posted: "week", remote_jobs_only: false },
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
