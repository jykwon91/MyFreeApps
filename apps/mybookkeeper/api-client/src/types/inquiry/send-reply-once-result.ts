import type { ReplySendResult } from "./reply-send-result";

export interface SendReplyOnceResult {
  result: ReplySendResult;
  /** The id is done with: the reply went out, or the server holds a different reply under it. */
  idSpent: boolean;
  /** For an `otherAccount` failure, the account the earlier attempt went through. */
  otherGmailAddress: string | null;
}
