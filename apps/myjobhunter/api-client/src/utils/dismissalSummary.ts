import { timeAgo } from "@platform/core/utils/timeAgo";
import { DISMISSAL_MESSAGES } from "../constants/discoverMessages";
import { DISMISS_REASON_OPTIONS } from "../constants/dismissReasons";
import type { DiscoveredJob } from "../types/discovery/discovered-job";

/**
 * "Dismissed 2 days ago · Wrong tech stack" for a dismissed posting, without the reason when none
 * was given (or the server sent one this client doesn't know). Null for a posting not dismissed.
 */
export function dismissalSummary(job: Pick<DiscoveredJob, "dismissed_at" | "dismissed_reason">): string | null {
  if (!job.dismissed_at) return null;
  const when = DISMISSAL_MESSAGES.dismissedAgo(timeAgo(job.dismissed_at));
  const reason = DISMISS_REASON_OPTIONS.find((option) => option.value === job.dismissed_reason);
  return reason ? DISMISSAL_MESSAGES.withReason(when, reason.label) : when;
}
