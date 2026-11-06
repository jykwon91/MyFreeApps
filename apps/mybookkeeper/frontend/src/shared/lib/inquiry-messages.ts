import { REPLY_SEND_ACTION } from "@mybookkeeper/api-client/constants/replySendAction";
import type { ReplySendAction } from "@mybookkeeper/api-client/types/inquiry/reply-send-action";
import type { ReplySendFailure } from "@mybookkeeper/api-client/types/inquiry/reply-send-failure";

export const INQUIRY_MESSAGES = {
  viewOnlyNote: "View only. Ask a workspace admin to reply to, promote, or change inquiries.",
  noNotes: "No notes yet.",
  noInquiries:
    'No inquiries yet. They\'ll land here when guests reach out via Furnished Finder, TNH, or directly. Use "New inquiry" to log one manually.',
  noInquiriesViewer:
    "No inquiries yet. They'll land here when guests reach out via Furnished Finder, TNH, or directly.",
  noInquiriesInStage: "No inquiries in this stage. Try a different filter.",
  replySent: "Reply sent.",
  replyMissingParts: "Add a subject and a message before sending.",
  replyStillSending: "Still sending your reply...",
  replySendButton: "Send reply",
  replyTryAgainButton: "Try again",
  replyCheckAgainButton: "Check again",
  replySendAsNewButton: "Send as a new reply",
  replyChangedAfterMightHaveSent:
    "Your earlier reply may already have reached them, so sending this changed version would be a second email. Undo your changes to safely try the first one again.",
  replySendingButton: "Sending...",
  replyStillSendingButton: "Still sending...",
} as const;

/** Why a reply didn't go out, or might not have. Each says whether trying again is safe. */
export const REPLY_SEND_FAILURE_WORDS: Readonly<Record<ReplySendFailure, string>> = {
  gmailDisconnected: "Gmail disconnected. Reconnect it on the Integrations page to send replies.",
  gmailConnection: "I couldn't send that. Check your Gmail connection on the Integrations page.",
  gmailRejected: "Gmail didn't accept that, so nothing was sent. Want to try again?",
  gone: "I can't find that inquiry anymore.",
  viewOnly: "You have view-only access, so I can't send replies.",
  noRecipient: "This inquiry has no email address, so I can't send a reply.",
  unsure: "I couldn't confirm that went out. Try again without changing it and I won't send it twice.",
  notRecorded:
    "That went out, but I couldn't add it to this conversation. Don't send it again. Check again in about 15 minutes and I'll add it.",
  inFlight:
    "An earlier copy of this reply is still going out, and I won't send a second one. If it hasn't finished, check again in a few minutes. It can take up to 15.",
  refused: "I couldn't send that. Want to try again?",
};

export const REPLY_SEND_LABELS: Readonly<Record<ReplySendAction, string>> = {
  [REPLY_SEND_ACTION.SEND]: INQUIRY_MESSAGES.replySendButton,
  [REPLY_SEND_ACTION.TRY_AGAIN]: INQUIRY_MESSAGES.replyTryAgainButton,
  [REPLY_SEND_ACTION.CHECK_AGAIN]: INQUIRY_MESSAGES.replyCheckAgainButton,
  [REPLY_SEND_ACTION.SEND_AS_NEW]: INQUIRY_MESSAGES.replySendAsNewButton,
};
