import type { ReplyDraft } from "../types/inquiry/reply-draft";
import { fnv1aHash } from "./fnv1aHash";
import { replyInquiryKeyPrefix } from "./replyInquiryKeyPrefix";

/**
 * One key per inquiry and reply as the server fingerprints it (template, subject,
 * body), so the same text always finds its id and different text never does. The
 * text is hashed so it isn't kept in storage. Two texts that collide share an id;
 * the server tells them apart and answers 422 reused, which gets a fresh id.
 */
export function replyRequestKey(inquiryId: string, draft: ReplyDraft): string {
  return `${replyInquiryKeyPrefix(inquiryId)}${fnv1aHash(JSON.stringify([draft.template_id ?? null, draft.subject, draft.body]))}`;
}
