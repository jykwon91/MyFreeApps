import type { ReplySendFailure } from "../types/inquiry/reply-send-failure";

/** The reply may already be in the inquirer's inbox, so sending different text could reach them twice. */
export function replyMightHaveSent(failure: ReplySendFailure): boolean {
  return failure === "unsure" || failure === "notRecorded" || failure === "inFlight";
}
