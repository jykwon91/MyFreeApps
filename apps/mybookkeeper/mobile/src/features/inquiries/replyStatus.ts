import { REPLY_SEND_ACTION } from "@mybookkeeper/api-client/constants/replySendAction";
import type { Integration } from "@mybookkeeper/api-client/types/integration/integration";
import type { ReplySendAction } from "@mybookkeeper/api-client/types/inquiry/reply-send-action";
import type { ReplySendFailure } from "@mybookkeeper/api-client/types/inquiry/reply-send-failure";
import type { ReplyBlock } from "../../types/ReplyBlock";

export const REPLY_BLOCK_WORDS: Record<ReplyBlock, string> = {
  noGmail: "Connect Gmail to send replies. That part happens on the website.",
  noSendPermission: "Gmail needs permission to send as you. Reconnect it on the website. Your existing access stays.",
  gmailDisconnected: "Gmail disconnected. Reconnect on the website to send replies.",
  noEmailAddress: "This inquiry has no email address, so I can't send a reply. You can call instead.",
};

export const REPLY_FAILURE_WORDS: Record<ReplySendFailure, string> = {
  gmailDisconnected: "Gmail disconnected. Reconnect on the website to send replies.",
  gmailConnection: "I couldn't send that. Check your Gmail connection on the website.",
  gmailRejected: "Gmail didn't accept that. Nothing was sent. Want me to try again?",
  gone: "I can't find that inquiry anymore.",
  viewOnly: "You have view-only access.",
  noRecipient: "This inquiry has no email address, so I can't send a reply. You can call instead.",
  unsure: "I couldn't confirm that went out. Try again without changing it and I won't send it twice.",
  notRecorded: "That went out, but I couldn't add it to this conversation. Don't send it again. Check again in about 15 minutes and I'll add it.",
  inFlight: "An earlier copy of this reply is still going out, and I won't send a second one. If it hasn't finished, check again in a few minutes. It can take up to 15.",
  refused: "I couldn't send that. Want to try again?",
};

export const REPLY_SEND_LABELS: Record<ReplySendAction, string> = {
  [REPLY_SEND_ACTION.SEND]: "Send",
  [REPLY_SEND_ACTION.TRY_AGAIN]: "Try again",
  [REPLY_SEND_ACTION.CHECK_AGAIN]: "Check again",
  [REPLY_SEND_ACTION.SEND_AS_NEW]: "Send as a new reply",
};

export const REPLY_SEND_WORDS = {
  sending: "Sending…",
  stillSending: "Still sending…",
  changedAfterMightHaveSent:
    "Your earlier reply may already have reached them, so sending this changed version would be a second email. Undo your changes to safely try the first one again.",
} as const;

/** While integrations are unknown nothing blocks: the server has the last word. */
export function replyBlock(integrations: Integration[] | undefined, email: string | null | undefined): ReplyBlock | null {
  if (!email?.trim()) return "noEmailAddress";
  if (!integrations) return null;
  const gmail = integrations.find((integration) => integration.provider === "gmail");
  if (!gmail) return "noGmail";
  if (gmail.needs_reauth) return "gmailDisconnected";
  return gmail.has_send_scope === false ? "noSendPermission" : null;
}

export function matchesRendered(
  draft: { subject: string; body: string },
  rendered: { subject: string; body: string } | null,
): boolean {
  return rendered !== null && draft.subject === rendered.subject && draft.body === rendered.body;
}

export function replySendingAnnouncement(hasSent: boolean, isWaiting: boolean, isBusy: boolean): string | undefined {
  if (hasSent) return "Reply sent";
  if (isWaiting) return "Still sending your reply";
  return isBusy ? "Sending reply" : undefined;
}
