import type { ReplyDraft as ReplyToSend } from "@mybookkeeper/api-client/types/inquiry/reply-draft";
import type { ReplyDraft } from "../../types/ReplyDraft";

/** Exactly what's sent, which is also what decides whether a send is a retry. */
export function replyToSend(draft: ReplyDraft): ReplyToSend {
  return { template_id: draft.templateId, subject: draft.subject.trim(), body: draft.body };
}
