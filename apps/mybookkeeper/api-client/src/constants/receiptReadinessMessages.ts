import type { ReceiptGmailState } from "../types/lease/receipt-gmail-state";
import type { ReceiptSendBlocker } from "../types/lease/receipt-send-blocker";

/** Why Send is off for one receipt. Each app adds where to fix it. */
export const RECEIPT_SEND_BLOCKER_MESSAGES: Readonly<Record<ReceiptSendBlocker, string>> = {
  not_attributed: "This payment isn't linked to a tenant anymore. Link it in Payment Review first.",
  tenant_of_other_member: "A teammate added this tenant, so only they can send this receipt.",
  tenant_no_email: "There's no email on file for this tenant, so I can't send it.",
  no_lease: "I can't find a signed lease to save this receipt with. Add their lease, then come back.",
};

/** Why Send is off for every receipt. Absent when Gmail is ready. */
export const RECEIPT_GMAIL_STATE_MESSAGES: Readonly<
  Record<Exclude<ReceiptGmailState, "ready">, string>
> = {
  not_connected: "I can't email receipts until Gmail is connected.",
  needs_send_permission: "Gmail is connected, but I'm not allowed to send from it. Reconnect it to turn receipts on.",
  needs_reconnect: "Gmail needs to be reconnected before I can send.",
};
