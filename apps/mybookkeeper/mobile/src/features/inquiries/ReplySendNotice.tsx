import { Banner } from "@platform/mobile";
import type { ReplySendNoticeProps } from "../../types/ReplySendNoticeProps";
import { REPLY_FAILURE_WORDS, REPLY_SEND_WORDS, replySentFromOtherGmailWords } from "./replyStatus";

/** What the last send means for the reply as it now stands, if anything. */
export default function ReplySendNotice({ failure, isBlocked, changedAfterMightHaveSent, otherGmailAddress }: ReplySendNoticeProps) {
  if (isBlocked) return null;
  if (failure === "otherAccount" && otherGmailAddress) return <Banner message={replySentFromOtherGmailWords(otherGmailAddress)} />;
  if (failure) return <Banner message={REPLY_FAILURE_WORDS[failure]} />;
  if (changedAfterMightHaveSent) return <Banner message={REPLY_SEND_WORDS.changedAfterMightHaveSent} />;
  return null;
}
