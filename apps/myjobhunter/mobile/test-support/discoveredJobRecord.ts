import type { DiscoveredJob } from "@myjobhunter/api-client/types/discovery/discovered-job";

/** An unscored, unsaved posting with no link, unless a test says otherwise. */
export function discoveredJobRecord(overrides: Partial<DiscoveredJob> & Pick<DiscoveredJob, "id">): DiscoveredJob {
  return {
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
