import type { DiscoveredJob } from "@myjobhunter/api-client/types/discovery/discovered-job";
import type { DiscoverySource } from "@myjobhunter/api-client/types/discovery/discovery-source";
import type { Profile } from "@myjobhunter/api-client/types/profile/profile";
import { profileRecord } from "./profileRecord";
import type { FakeParams } from "@platform/mobile/test-support/types/FakeParams";
import type { FakeReply } from "@platform/mobile/test-support/types/FakeReply";
import type { FakeRoute } from "@platform/mobile/test-support/types/FakeRoute";

/** GET /discover's page of `jobs` for these params, as the server pages it, with the inbox's scoring coverage. */
export function discoverPage(jobs: readonly DiscoveredJob[], params: FakeParams): FakeReply {
  const offset = Number(params.offset ?? 0);
  const limit = Number(params.limit ?? 50);
  const items = jobs.slice(offset, offset + limit);
  const isInbox = (params.state ?? "inbox") === "inbox";
  return {
    status: 200,
    data: {
      items,
      total: jobs.length,
      has_more: offset + items.length < jobs.length,
      state: params.state ?? "inbox",
      scored_count: isInbox ? jobs.filter((job) => job.score !== null).length : null,
      total_count: isInbox ? jobs.length : null,
    },
  };
}

/** The postings in a view: the inbox is neither saved nor dismissed; saved is saved and not dismissed. Filtered by saved search. */
export function jobsFor(jobs: readonly DiscoveredJob[], params: FakeParams): DiscoveredJob[] {
  const state = params.state ?? "inbox";
  return jobs.filter(
    (job) =>
      job.dismissed_at === null &&
      (state === "saved" ? job.saved_at !== null : job.saved_at === null) &&
      (!params.source_id || job.discovery_source_id === params.source_id),
  );
}

/** Everything Discovery reads: its saved searches and postings, and the profile, skills and work history the new-search form fills itself from. */
export function discoverRoutes(
  sources: readonly DiscoverySource[],
  jobs: readonly DiscoveredJob[],
  options: { profile?: Profile; skills?: number } = {},
): Record<string, FakeRoute> {
  const skills = Array.from({ length: options.skills ?? 1 }, (_, index) => ({ id: `sk${index}`, name: `Skill ${index}` }));
  return {
    "GET /discover/sources": () => ({ status: 200, data: sources }),
    "GET /discover": (_body, params) => discoverPage(jobsFor(jobs, params), params),
    "GET /profile": () => ({ status: 200, data: options.profile ?? profileRecord() }),
    "GET /skills": () => ({ status: 200, data: { items: skills, total: skills.length } }),
    "GET /work-history": () => ({ status: 200, data: { items: [], total: 0 } }),
  };
}
