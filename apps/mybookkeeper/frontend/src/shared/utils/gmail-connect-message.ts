import { GMAIL_CONNECT_FAILURES } from "@mybookkeeper/api-client/constants/gmailConnect";
import { GMAIL_CONNECT_FAILED_MESSAGE, GMAIL_CONNECTED_MESSAGE } from "@/shared/lib/gmail-connect-messages";
import type { GmailConnectFinish } from "@/shared/types/integration/gmail-connect-finish";
import type { GmailConnectMessage } from "@/shared/types/integration/gmail-connect-message";

/** The message the popup posts for how it finished, or null while it hasn't. */
export function gmailConnectMessageFor(finish: GmailConnectFinish): GmailConnectMessage | null {
  if (finish.kind === "connected") return { type: GMAIL_CONNECTED_MESSAGE };
  if (finish.kind === "failed") return { type: GMAIL_CONNECT_FAILED_MESSAGE, reason: finish.reason };
  return null;
}

/** A message posted to this page, if it's one the popup sends. A reason it doesn't know reads as `failed`. */
export function readGmailConnectMessage(data: unknown): GmailConnectMessage | null {
  const message = data as { type?: unknown; reason?: unknown } | null;
  if (message?.type === GMAIL_CONNECTED_MESSAGE) return { type: GMAIL_CONNECTED_MESSAGE };
  if (message?.type !== GMAIL_CONNECT_FAILED_MESSAGE) return null;
  const reason = GMAIL_CONNECT_FAILURES.find((failure) => failure === message.reason) ?? "failed";
  return { type: GMAIL_CONNECT_FAILED_MESSAGE, reason };
}
