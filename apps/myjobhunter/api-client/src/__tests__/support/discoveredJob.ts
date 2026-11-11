import type { DiscoveredJob } from "../../types/discovery/discovered-job";

/** An unscored, unsaved posting as GET /discover returns it. */
export function discoveredJob(overrides: Partial<DiscoveredJob> = {}): DiscoveredJob {
  return {
    id: "j1",
    source: "jsearch",
    source_publisher: null,
    source_url: null,
    title: "Backend Engineer",
    company_name: "Acme",
    location: null,
    remote_type: "unknown",
    description: null,
    posted_at: null,
    discovered_at: "2026-11-10T00:00:00Z",
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    salary_period: null,
    score: null,
    score_reason: null,
    scored_at: null,
    dismissed_at: null,
    dismissed_reason: null,
    saved_at: null,
    promoted_application_id: null,
    verdict: null,
    discovery_source_id: null,
    ...overrides,
  };
}
