import { RECEIPT_PAYMENT_METHOD_LABELS } from "@mybookkeeper/api-client/constants/receiptPaymentMethods";
import { RECEIPT_GMAIL_STATE_MESSAGES, RECEIPT_SEND_BLOCKER_MESSAGES } from "@mybookkeeper/api-client/constants/receiptReadinessMessages";
import type { PendingReceipt } from "@mybookkeeper/api-client/types/lease/pending-receipt";
import type { ReceiptGmailState } from "@mybookkeeper/api-client/types/lease/receipt-gmail-state";
import type { ReceiptSendBlocker } from "@mybookkeeper/api-client/types/lease/receipt-send-blocker";
import { inferPaymentMethod } from "@mybookkeeper/api-client/utils/inferPaymentMethod";
import { receiptPayerName } from "@mybookkeeper/api-client/utils/receiptPayerName";
import { formatCurrency } from "@platform/core/utils/currency";
import { BLOCKERS_FIXED_ON_WEBSITE, FIX_ON_WEBSITE, NO_PAYMENT_METHOD, RECEIPTS_MESSAGES as MESSAGES } from "../../constants/receipts";
import { dateFromIso, fullDateLabel } from "../../lib/localDate";
import { shortDate, spokenDate, spokenMoney } from "../transactions/transactionDisplay";

export function rowName(receipt: PendingReceipt): string {
  return receiptPayerName(receipt) ?? MESSAGES.unnamed;
}

export function sentenceName(receipt: PendingReceipt): string {
  return receiptPayerName(receipt) ?? MESSAGES.thisTenant;
}

export function receiptAmount(receipt: PendingReceipt): string {
  return formatCurrency(Number(receipt.amount));
}

/** Only worth saying when someone else paid: a parent, a partner, a company. */
export function paidByLine(receipt: PendingReceipt): string | null {
  const { payer_name: payer, tenant_name: tenant } = receipt;
  return payer && tenant && payer.trim().toLowerCase() !== tenant.trim().toLowerCase() ? `Paid by ${payer}` : null;
}

function isWholeMonth(start: Date, end: Date): boolean {
  const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  return start.getDate() === 1 && end.getFullYear() === start.getFullYear() && end.getMonth() === start.getMonth() && end.getDate() === lastDay;
}

/** "June 2026" for a calendar month, else "Jun 1 – Jun 15", with years when it spans two. */
export function periodLabel(startIso: string, endIso: string): string {
  const start = dateFromIso(startIso);
  const end = dateFromIso(endIso);
  if (isWholeMonth(start, end)) return start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", ...(start.getFullYear() === end.getFullYear() ? {} : { year: "numeric" }) };
  return `${start.toLocaleDateString("en-US", options)} – ${end.toLocaleDateString("en-US", options)}`;
}

export function receivedLine(receipt: PendingReceipt): string {
  return `Received ${shortDate(receipt.transaction_date)}`;
}

export function moreWaitingLine(count: number): string {
  return `${count} more ${count === 1 ? "is" : "are"} waiting. They'll show up as you finish these.`;
}

export function blockerMessage(blocker: ReceiptSendBlocker): string {
  const reason = RECEIPT_SEND_BLOCKER_MESSAGES[blocker];
  return BLOCKERS_FIXED_ON_WEBSITE.has(blocker) ? `${reason} ${FIX_ON_WEBSITE}` : reason;
}

/** Null when Gmail can send. */
export function gmailMessage(state: ReceiptGmailState): string | null {
  return state === "ready" ? null : `${RECEIPT_GMAIL_STATE_MESSAGES[state]} ${FIX_ON_WEBSITE}`;
}

// Each label starts with the button's words, so Voice Control can still find it by what's on screen.
export function reviewActionLabel(receipt: PendingReceipt): string {
  return `${MESSAGES.reviewAndSend}, the receipt for ${rowName(receipt)}`;
}

export function dismissActionLabel(receipt: PendingReceipt): string {
  return `${MESSAGES.dismiss} the receipt for ${rowName(receipt)}`;
}

export function rowLabel(receipt: PendingReceipt): string {
  return [
    rowName(receipt),
    spokenMoney(Number(receipt.amount)),
    `for ${periodLabel(receipt.period_start_date, receipt.period_end_date)}`,
    `received ${spokenDate(receipt.transaction_date)}`,
  ].join(", ");
}

export function sendQuestion(receipt: PendingReceipt): string {
  return `Email ${sentenceName(receipt)} a receipt?`;
}

export function sendExplanation(receipt: PendingReceipt, values: { periodStart: string; periodEnd: string }): string {
  const name = sentenceName(receipt);
  return `I'll email a ${receiptAmount(receipt)} receipt for ${periodLabel(values.periodStart, values.periodEnd)} to ${name} and save a copy with their lease. I can't unsend it.`;
}

export function sentMessage(receipt: PendingReceipt, receiptNumber: string): string {
  return `Sent. Receipt ${receiptNumber} is on its way to ${sentenceName(receipt)}.`;
}

export function endBeforeStartMessage(startIso: string): string {
  return `Pick an end date on or after ${fullDateLabel(startIso)}.`;
}

function isPrintableMethod(method: string): boolean {
  return Object.prototype.hasOwnProperty.call(RECEIPT_PAYMENT_METHOD_LABELS, method);
}

/** The method the payment suggests, if it's one a receipt can print. */
export function guessedPaymentMethod(receipt: PendingReceipt): string {
  const guess = inferPaymentMethod(receipt);
  return isPrintableMethod(guess) ? guess : NO_PAYMENT_METHOD;
}

export function paymentMethodLabel(method: string): string {
  return isPrintableMethod(method) ? RECEIPT_PAYMENT_METHOD_LABELS[method] : MESSAGES.leaveItOff;
}
