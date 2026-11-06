import type { InquiryReplyRequest } from "./inquiry-reply-request";

/** What the host wrote; the request id is added per send. */
export type ReplyDraft = Omit<InquiryReplyRequest, "client_request_id">;
