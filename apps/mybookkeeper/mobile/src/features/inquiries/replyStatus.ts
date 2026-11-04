import type { InquiryMessage } from "@mybookkeeper/api-client/types/inquiry/inquiry-message";
import type { Integration } from "@mybookkeeper/api-client/types/integration/integration";
import type { ReplyBlock } from "../../types/ReplyBlock";
import type { ReplyFailure } from "../../types/ReplyFailure";
import { httpStatus } from "../transactions/transactionMessages";

export const REPLY_BLOCK_WORDS: Record<ReplyBlock, string> = {
  noGmail: "Connect Gmail to send replies. That part happens on the website.",
  noSendPermission: "Gmail needs permission to send as you. Reconnect it on the website. Your existing access stays.",
  gmailDisconnected: "Gmail disconnected. Reconnect on the website to send replies.",
  noEmailAddress: "This inquiry has no email address, so I can't send a reply. You can call instead.",
};

export const REPLY_FAILURE_WORDS: Record<ReplyFailure, string> = {
  gmailDisconnected: "Gmail disconnected. Reconnect on the website to send replies.",
  gmailConnection: "I couldn't send that. Check your Gmail connection on the website.",
  gmailRejected: "Gmail didn't accept that. Nothing was sent. Want me to try again?",
  gone: "I can't find that inquiry anymore.",
  viewOnly: "You have view-only access.",
  unsure: "I'm not sure that went through. Check your Gmail sent folder before sending again.",
  refused: "I couldn't send that. Want to try again?",
};

/** While integrations are unknown nothing blocks: the server has the last word. */
export function replyBlock(integrations: Integration[] | undefined, email: string | null | undefined): ReplyBlock | null {
  if (!email?.trim()) return "noEmailAddress";
  if (!integrations) return null;
  const gmail = integrations.find((integration) => integration.provider === "gmail");
  if (!gmail) return "noGmail";
  if (gmail.needs_reauth) return "gmailDisconnected";
  return gmail.has_send_scope === false ? "noSendPermission" : null;
}

export function replyFailure(error: unknown): ReplyFailure {
  const status = httpStatus(error);
  if (status === 403) return "viewOnly";
  if (status === 404) return "gone";
  const detail = (error as { data?: { detail?: unknown } } | null)?.data?.detail;
  // The route's own refusals are sentences. A list is the request failing validation.
  if (status === 422) return typeof detail === "string" ? "gmailConnection" : "refused";
  if (status === 502) return "gmailRejected";
  if (status === 503 && detail === "gmail_reauth_required") return "gmailDisconnected";
  // No answer, or a server fault: Gmail may have sent it before things went wrong.
  return status === undefined || status >= 500 ? "unsure" : "refused";
}

/** The server may have put a pet disclosure in front of what was typed, so this looks inside. */
export function replyArrived(messages: InquiryMessage[] | undefined, knownIds: readonly string[], body: string): boolean {
  return (messages ?? []).some(
    (message) =>
      message.direction === "outbound" &&
      !knownIds.includes(message.id) &&
      (message.parsed_body ?? message.raw_email_body ?? "").includes(body.trim()),
  );
}

export function matchesRendered(
  draft: { subject: string; body: string },
  rendered: { subject: string; body: string } | null,
): boolean {
  return rendered !== null && draft.subject === rendered.subject && draft.body === rendered.body;
}
