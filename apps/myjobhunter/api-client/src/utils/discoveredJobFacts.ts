import { formatSalaryRange } from "@platform/core/utils/salaryRange";
import { DEFAULT_SALARY_CURRENCY, DISCOVERED_REMOTE_LABELS } from "../constants/discoveredJobLabels";
import type { DiscoveredJob } from "../types/discovery/discovered-job";
import type { DiscoveredJobFacts } from "../types/discovery/discovered-job-facts";
import type { DiscoverySource } from "../types/discovery/discovery-source";
import { formatVerdict } from "./formatVerdict";
import { savedSearchName } from "./savedSearchName";
import { timeAgo } from "@platform/core/utils/timeAgo";
import { toneForVerdict } from "./toneForVerdict";

/**
 * What a posting's card shows. A score is stale when the profile changed after it was computed:
 * the worker scores it again on its next pass. The saved search's name comes from the sources
 * already loaded, so there is no extra request; legacy rows have none.
 */
export function discoveredJobFacts(job: DiscoveredJob, profileUpdatedAt: string | null, sources: readonly DiscoverySource[]): DiscoveredJobFacts {
  const salary = formatSalaryRange(
    job.salary_min !== null ? String(job.salary_min) : null,
    job.salary_max !== null ? String(job.salary_max) : null,
    job.salary_currency ?? DEFAULT_SALARY_CURRENCY,
    job.salary_period,
  );
  const isUnscored = job.verdict === null && job.score === null;
  const source = job.discovery_source_id ? sources.find((candidate) => candidate.id === job.discovery_source_id) : undefined;
  return {
    remoteLabel: DISCOVERED_REMOTE_LABELS[job.remote_type] || null,
    salaryLabel: salary && salary !== "—" ? salary : null,
    postedLabel: job.posted_at ? timeAgo(job.posted_at) : null,
    verdictLabel: formatVerdict(job.verdict),
    verdictTone: toneForVerdict(job.verdict),
    isUnscored,
    isScoreStale: !isUnscored && job.scored_at !== null && profileUpdatedAt !== null && new Date(profileUpdatedAt) > new Date(job.scored_at),
    isSaved: Boolean(job.saved_at),
    isPromoted: Boolean(job.promoted_application_id),
    sourceName: source ? savedSearchName(source) : null,
  };
}
