import type { InboxCardKind } from "@/games/wow-forever/types/featureRequests/triage/inboxCardKind";
import type { TriageInboxItem } from "@/games/wow-forever/types/featureRequests/triage/triageInboxItem";

/**
 * Which card an inbox submission gets. A `new` story still `submitted` is waiting for Approve; one that's
 * already public or merged was handled elsewhere (only "Got it"). Rejected submissions, unanswered
 * questions and anything without a story go to the collapsed "Rejected by Claude" section. Pure.
 */
export function inboxCardKind(item: TriageInboxItem): InboxCardKind {
  if (item.story === null) return "rejected";
  if (item.verdict === "new") return item.story.status === "submitted" ? "new" : "already_handled";
  if (item.verdict === "duplicate") return "duplicate";
  return "rejected";
}
