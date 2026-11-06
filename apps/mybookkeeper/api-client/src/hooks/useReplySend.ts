import { useCallback, useEffect, useRef, useState } from "react";
import { REPLY_IN_FLIGHT_RETRY_DELAYS_MS } from "../constants/replySendRetry";
import { useSendInquiryReplyMutation } from "../store/inquiriesApi";
import type { ReplyDraft } from "../types/inquiry/reply-draft";
import type { ReplySendResult } from "../types/inquiry/reply-send-result";
import type { UseReplySendOptions } from "../types/inquiry/use-reply-send-options";
import { replyMightHaveSent } from "../utils/replyMightHaveSent";
import { replyMightHaveSentKey } from "../utils/replyMightHaveSentKey";
import { replyRequestKey } from "../utils/replyRequestKey";
import { sendReplyOnce } from "../utils/sendReplyOnce";
import { sleep } from "../utils/sleep";

/**
 * Sends a reply under one request id per reply text, so a double tap, a retry
 * after a lost answer or a second try after reopening never emails the inquirer
 * twice. Different text is a different reply and gets its own id.
 *
 * `mightHaveSent` stays true (through edits and reopening) once a send may have
 * reached the inquirer, until a send is confirmed; `isRetry(draft)` says whether
 * that draft would go out under a waiting id, so sending it again is safe.
 */
export function useReplySend(inquiryId: string, { newRequestId, requestIds }: UseReplySendOptions) {
  const [sendReply] = useSendInquiryReplyMutation();
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [isSending, setIsSending] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [mightHaveSent, setMightHaveSent] = useState(() => requestIds.get(replyMightHaveSentKey(inquiryId)) !== null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const send = useCallback(
    async (draft: ReplyDraft): Promise<ReplySendResult | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setIsSending(true);
      try {
        const key = replyRequestKey(inquiryId, draft);
        const id = requestIds.get(key) ?? newRequestId();
        requestIds.set(key, id);
        const { result, idSpent } = await sendReplyOnce({
          post: () => sendReply({ inquiryId, data: { ...draft, client_request_id: id } }).unwrap(),
          delays: REPLY_IN_FLIGHT_RETRY_DELAYS_MS,
          sleep,
          keepGoing: () => mounted.current,
          onWaiting: (waiting) => {
            if (mounted.current) setIsWaiting(waiting);
          },
        });
        if (idSpent) requestIds.delete(key);
        if (result.ok) {
          requestIds.delete(replyMightHaveSentKey(inquiryId));
          if (mounted.current) setMightHaveSent(false);
        } else if (replyMightHaveSent(result.failure)) {
          requestIds.set(replyMightHaveSentKey(inquiryId), "true");
          if (mounted.current) setMightHaveSent(true);
        }
        return result;
      } finally {
        inFlight.current = false;
        if (mounted.current) setIsSending(false);
      }
    },
    [inquiryId, newRequestId, requestIds, sendReply],
  );

  const isRetry = useCallback(
    (draft: ReplyDraft) => requestIds.get(replyRequestKey(inquiryId, draft)) !== null,
    [inquiryId, requestIds],
  );

  return { send, isRetry, isSending, isWaiting, mightHaveSent };
}
