import { safeLinkUrl } from "@platform/core/utils/safeLinkUrl";
import { WEB_LINK_SCHEMES } from "../constants/webLinkSchemes";
import type { DiscoveredJob } from "../types/discovery/discovered-job";

/**
 * The posting's own page, when it's an http or https link; otherwise null, so no Open is offered.
 * The link comes from a job board's feed, not from the person, so it's checked before anything opens it.
 */
export function discoveredJobUrl(job: Pick<DiscoveredJob, "source_url">): string | null {
  return job.source_url === null ? null : safeLinkUrl(job.source_url, WEB_LINK_SCHEMES);
}
