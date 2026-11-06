import { REPLY_REQUEST_ID_REUSED } from "../constants/replySendDetails";
import type { SendReplyOnceOptions } from "../types/inquiry/send-reply-once-options";
import type { SendReplyOnceResult } from "../types/inquiry/send-reply-once-result";
import { errorDetail } from "./errorDetail";
import { replySendFailure } from "./replySendFailure";

/** Sends, asking again with the same id while the server says an earlier attempt is in flight. */
export async function sendReplyOnce({
  post,
  delays,
  sleep,
  keepGoing,
  onWaiting,
}: SendReplyOnceOptions): Promise<SendReplyOnceResult> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const message = await post();
      onWaiting(false);
      return { result: { ok: true, message }, idSpent: true };
    } catch (error) {
      const failure = replySendFailure(error);
      if (failure === "inFlight" && attempt < delays.length && keepGoing()) {
        onWaiting(true);
        await sleep(delays[attempt]);
        if (keepGoing()) continue;
      }
      onWaiting(false);
      return { result: { ok: false, failure }, idSpent: errorDetail(error) === REPLY_REQUEST_ID_REUSED };
    }
  }
}
