import { useCallback, useEffect, useRef, useState } from "react";
import { REPLY_IN_FLIGHT_RETRY_DELAYS_MS } from "../constants/replySendRetry";
import { useSendInquiryReplyMutation } from "../store/inquiriesApi";
import type { ReplyDraft } from "../types/inquiry/reply-draft";
import type { ReplySendResult } from "../types/inquiry/reply-send-result";
import type { UseReplySendOptions } from "../types/inquiry/use-reply-send-options";
import { replyMightHaveSent } from "../utils/replyMightHaveSent";
import { replyInquiryKeyPrefix } from "../utils/replyInquiryKeyPrefix";
import { replyMightHaveSentKey } from "../utils/replyMightHaveSentKey";
import { replyRequestKey } from "../utils/replyRequestKey";
import { sendReplyOnce } from "../utils/sendReplyOnce";
import { sleep } from "../utils/sleep";
import { withUncheckableAccount } from "../utils/withUncheckableAccount";

/**
 * Sends a reply under one request id per reply text, so a double tap, a retry
 * after a lost answer or a second try after reopening never emails the inquirer
 * twice. Different text is a different reply and gets its own id.
 *
 * `mightHaveSent` stays true (through edits and reopening) once a send may have
 * reached the inquirer, until a send is confirmed; `isRetry(draft)` says whether
 * that draft would go out under a waiting id, so sending it again is safe.
 *
 * When the server can't check an earlier attempt because it went through a Gmail
 * account that isn't connected now, `otherGmailAddress(draft)` names that account
 * and the next send of that draft goes out under a new id, as a second email.
 * That's only remembered while this is mounted, so reopening checks again, which
 * works once that account is reconnected.
 */
export function useReplySend(inquiryId: string, { newRequestId, requestIds }: UseReplySendOptions) {
  const [sendReply] = useSendInquiryReplyMutation();
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [isSending, setIsSending] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [mightHaveSent, setMightHaveSent] = useState(() => requestIds.get(replyMightHaveSentKey(inquiryId)) !== null);
  // Reply key → the account its earlier attempt went through, for drafts the server couldn't check.
  const [uncheckable, setUncheckable] = useState<ReadonlyMap<string, string>>(() => new Map());

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
        const asNew = uncheckable.has(key);
        const id = (asNew ? null : requestIds.get(key)) ?? newRequestId();
        requestIds.set(key, id);
        const { result, idSpent, otherGmailAddress } = await sendReplyOnce({
          post: () => sendReply({ inquiryId, data: { ...draft, client_request_id: id } }).unwrap(),
          delays: REPLY_IN_FLIGHT_RETRY_DELAYS_MS,
          sleep,
          keepGoing: () => mounted.current,
          onWaiting: (waiting) => {
            if (mounted.current) setIsWaiting(waiting);
          },
        });
        if (result.ok) {
          // Nothing earlier is left to check: any draft marked uncheckable would now be a second reply.
          if (mounted.current) setUncheckable(new Map());
          // A reply went, so none of this inquiry's waiting ids is a retry any more: kept,
          // a later reply with the same words would get that one back and send nothing.
          requestIds.deleteStartingWith(replyInquiryKeyPrefix(inquiryId));
          if (mounted.current) setMightHaveSent(false);
        } else {
          if (mounted.current) setUncheckable((current) => withUncheckableAccount(current, key, otherGmailAddress));
          if (idSpent) requestIds.delete(key);
          if (replyMightHaveSent(result.failure)) {
            requestIds.set(replyMightHaveSentKey(inquiryId), "true");
            if (mounted.current) setMightHaveSent(true);
          }
        }
        return result;
      } finally {
        inFlight.current = false;
        if (mounted.current) setIsSending(false);
      }
    },
    [inquiryId, newRequestId, requestIds, sendReply, uncheckable],
  );

  const isRetry = useCallback(
    (draft: ReplyDraft) => {
      const key = replyRequestKey(inquiryId, draft);
      return requestIds.get(key) !== null && !uncheckable.has(key);
    },
    [inquiryId, requestIds, uncheckable],
  );

  const otherGmailAddress = useCallback(
    (draft: ReplyDraft) => uncheckable.get(replyRequestKey(inquiryId, draft)) ?? null,
    [inquiryId, uncheckable],
  );

  return { send, isRetry, otherGmailAddress, isSending, isWaiting, mightHaveSent };
}
