import type { ResearchRunFailureReason } from "../types/company/research-run-failure-reason";

/**
 * Whether trying a failed run again could work. Research that isn't set up on the server, or a
 * company that's gone, can't; a rate limit can once a few minutes pass, and a run already going
 * elsewhere once it has finished. Shared by the web panel and the phone.
 */
export function canRetryResearch(reason: ResearchRunFailureReason): boolean {
  return reason !== "not-configured" && reason !== "company-gone";
}
