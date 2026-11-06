import type { InquiryMessage } from "./inquiry-message";
import type { ReplySendFailure } from "./reply-send-failure";

export type ReplySendResult =
  | { ok: true; message: InquiryMessage }
  | { ok: false; failure: ReplySendFailure };
