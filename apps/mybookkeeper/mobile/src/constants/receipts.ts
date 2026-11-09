import { RECEIPT_PAYMENT_METHOD_LABELS } from "@mybookkeeper/api-client/constants/receiptPaymentMethods";
import type { ReceiptSendBlocker } from "@mybookkeeper/api-client/types/lease/receipt-send-blocker";

/** One load covers every open receipt the server will return, so a deep link finds its row. */
export const RECEIPTS_LIMIT = 500;
export const RECEIPTS_SKELETON_ROWS = ["a", "b", "c"];
/** The first option in the payment method sheet. The send endpoint takes it as no method. */
export const NO_PAYMENT_METHOD = "";

/** Appended to a reason whose fix is only on the website. */
export const FIX_ON_WEBSITE = "You can do that on the website.";

/** Fixes that need the website. The rest can be done on the phone, or by someone else. */
export const BLOCKERS_FIXED_ON_WEBSITE: ReadonlySet<ReceiptSendBlocker> = new Set(["tenant_no_email"]);

export const RECEIPTS_MESSAGES = {
  loading: "Loading your rent receipts",
  loadingReceipt: "Loading this receipt",
  couldntLoad: "I couldn't load your rent receipts.",
  checkConnection: "Check your connection and try again.",
  tryAgain: "Try again",
  goBack: "Go back",
  noneHeading: "You're all caught up.",
  noneBody: "When you link a rent payment to a tenant, I'll line up a receipt here for you to send.",
  viewOnly: "You have view-only access, so you can look but not send or dismiss these.",
  viewOnlyHeading: "You have view-only access.",
  viewOnlyBody: "Only someone who can make changes in this workspace can send receipts.",
  notWaitingHeading: "That receipt isn't waiting anymore.",
  notWaitingBody: "It may have been sent or dismissed somewhere else.",
  unnamed: "Unnamed tenant",
  thisTenant: "this tenant",
  reviewAndSend: "Review & send",
  dismiss: "Dismiss",
  dismissing: "Dismissing…",
  dismissHint: "Asks you to confirm first",
  dismissTitle: "Dismiss this receipt?",
  dismissBody: "I'll take it off your list. The payment stays in your transactions.",
  dismissOtherGmailBody:
    "I'll take it off your list. Only do this if your tenant got it: if they didn't, reconnect that Gmail account on the website and send it instead.",
  dismissed: "Dismissed. The payment is still in your transactions.",
  checkingWithGmail: "I'm still checking with Gmail whether an earlier send went out. Sending again is safe: I won't email it twice.",
  openPaymentReview: "Open Payment Review",
  openWebsite: "Open the website",
  opensBrowser: "Opens your browser",
  rentPeriod: "Rent period",
  from: "From",
  to: "To",
  change: "Change",
  done: "Done",
  howTheyPaid: "How they paid",
  leaveItOff: "Leave it off the receipt",
  guessedMethod: "I guessed this from the payment. Change it if I'm wrong.",
  methodSheetTitle: "How did they pay?",
  previewPdf: "Preview the PDF",
  previewing: "Making the preview…",
  previewHint: "The receipt number is added when I send it.",
  previewFailed: "I couldn't make the preview. Check your connection and try again.",
  sendReceipt: "Send receipt",
  sending: "Sending…",
  cancel: "Cancel",
  amount: "Amount",
  received: "Received",
  couldntSend: "I couldn't send that. Want to try again?",
  gmailRefused: "Gmail turned that one down, so nothing was sent. Trying again is safe.",
  sendUnsure: "I can't tell yet whether that went out. Trying again is safe: I check Gmail first, so they won't get it twice.",
  offList: "It's off your list now, so it went out or was handled somewhere else.",
  gone: "I can't find that receipt anymore. It may have been sent or dismissed somewhere else.",
  viewerRefused: "You have view-only access, so I can't send or dismiss receipts.",
  dismissUnreachable: "I can't reach the server, so I'm not sure that went through. Trying again is safe.",
  dismissGone: "That one's gone. It may have been handled somewhere else.",
  dismissAlreadyHandled: "That one was already handled, so there's nothing to do.",
  dismissWhileSending:
    "I'm still confirming an earlier send of this receipt with Gmail, so I can't dismiss it yet. Try again in about 15 minutes.",
  couldntDismiss: "I couldn't dismiss that. Want to try again?",
} as const;

export const PAYMENT_METHOD_OPTIONS: readonly { value: string; label: string }[] = [
  { value: NO_PAYMENT_METHOD, label: RECEIPTS_MESSAGES.leaveItOff },
  ...Object.entries(RECEIPT_PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label })),
];
