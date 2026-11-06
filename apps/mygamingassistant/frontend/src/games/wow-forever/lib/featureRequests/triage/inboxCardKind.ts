import { INBOX_CARD_KIND } from "@/games/wow-forever/data/featureRequests/triage/triageEnums";
import type { InboxCardKind } from "@/games/wow-forever/types/featureRequests/triage/inboxCardKind";
import type { TriageInboxItem } from "@/games/wow-forever/types/featureRequests/triage/triageInboxItem";

/**
 * Which card an inbox submission gets. A `new` story still `submitted` is waiting for Approve; one that's
 * already public or merged was handled elsewhere (only "Got it"). Rejected submissions, unanswered
 * questions and anything without a story go to the collapsed "Rejected by Claude" section. Pure.
 */
export function inboxCardKind(item: TriageInboxItem): InboxCardKind {
  if (item.story === null) return INBOX_CARD_KIND.rejected;
  if (item.verdict === "new") return item.story.status === "submitted" ? INBOX_CARD_KIND.new : INBOX_CARD_KIND.alreadyHandled;
  if (item.verdict === "duplicate") return INBOX_CARD_KIND.duplicate;
  return INBOX_CARD_KIND.rejected;
}
