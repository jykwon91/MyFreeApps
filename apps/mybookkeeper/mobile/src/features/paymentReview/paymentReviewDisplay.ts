import { attributionPayoutLabel } from "@mybookkeeper/api-client/constants/attributionLabels";
import type { AttributionReviewItem } from "@mybookkeeper/api-client/types/attribution/attribution-review-item";
import { PAYMENT_REVIEW_MESSAGES as MESSAGES } from "../../constants/paymentReview";
import { TENANT_PICKER_MESSAGES } from "../../constants/tenantPicker";
import { spokenDate, spokenMoney } from "../transactions/transactionDisplay";

/** Same test as the website: a payout from a booking site belongs to a property, not a tenant. */
export function isPayout(item: AttributionReviewItem): boolean {
  const channel = item.transaction?.channel ?? null;
  return channel !== null && channel !== "direct";
}

export function payerName(item: AttributionReviewItem): string {
  return item.transaction?.payer_name ?? item.transaction?.vendor ?? MESSAGES.someone;
}

/** The target to offer. Deleting a tenant or property clears it, so a "fuzzy" row can have none. */
export function proposedTarget(item: AttributionReviewItem): { id: string; name: string } | null {
  if (isPayout(item)) {
    return item.proposed_property ? { id: item.proposed_property.id, name: item.proposed_property.name } : null;
  }
  return item.proposed_applicant
    ? { id: item.proposed_applicant.id, name: item.proposed_applicant.legal_name ?? TENANT_PICKER_MESSAGES.thisTenant }
    : null;
}

export function suggestionLine(item: AttributionReviewItem): string {
  const target = proposedTarget(item);
  if (isPayout(item)) return target ? `Looks like a payout for ${target.name}.` : MESSAGES.noPropertyGuess;
  return target ? `Looks like ${target.name}.` : MESSAGES.noTenantGuess;
}

export function confirmLabel(item: AttributionReviewItem, target: { name: string }): string {
  return isPayout(item) ? `Assign to ${target.name}` : `Yes, it's ${target.name}`;
}

export function queueCountLine(count: number): string {
  return `${count} ${count === 1 ? "payment" : "payments"} to review`;
}

export function moreWaitingLine(count: number): string {
  return `${count} more ${count === 1 ? "is" : "are"} waiting. They'll show up as you finish these.`;
}

function paymentPhrase(item: AttributionReviewItem): string {
  const kind = isPayout(item) ? "payout" : "payment";
  const amount = item.transaction ? ` of ${spokenMoney(Number(item.transaction.amount))}` : "";
  return `the ${kind}${amount} from ${payerName(item)}`;
}

// Each label starts with the button's words, so Voice Control can still find it by what's on screen.
export function confirmActionLabel(item: AttributionReviewItem, target: { name: string }): string {
  return `${confirmLabel(item, target)}, for ${paymentPhrase(item)}`;
}

export function pickLabel(item: AttributionReviewItem): string {
  if (isPayout(item)) return proposedTarget(item) ? MESSAGES.anotherProperty : MESSAGES.chooseProperty;
  return proposedTarget(item) ? MESSAGES.someoneElse : MESSAGES.chooseTenant;
}

export function pickActionLabel(item: AttributionReviewItem): string {
  return `${pickLabel(item)}, for ${paymentPhrase(item)}`;
}

export function skipActionLabel(item: AttributionReviewItem): string {
  return `Skip ${paymentPhrase(item)}`;
}

export function rowLabel(item: AttributionReviewItem): string {
  const transaction = item.transaction;
  const kind = transaction?.channel && isPayout(item) ? attributionPayoutLabel(transaction.channel) : "Rent payment";
  const facts = [
    `${kind} from ${payerName(item)}`,
    transaction ? spokenMoney(Number(transaction.amount)) : null,
    transaction ? spokenDate(transaction.transaction_date) : null,
    transaction?.description ? `memo ${transaction.description}` : null,
  ].filter(Boolean);
  return `${facts.join(", ")}. ${suggestionLine(item)}`;
}

export function linkQuestion(tenantName: string): string {
  return `Link this payment to ${tenantName}?`;
}

export function linkExplanation(item: AttributionReviewItem): string {
  const payer = item.transaction?.payer_name;
  return payer ? `I'll remember that ${payer} pays for them, so I can match it myself next time.` : "";
}

export function tenantLinkedMessage(item: AttributionReviewItem, tenantName: string): string {
  const payer = item.transaction?.payer_name;
  return payer ? `Linked to ${tenantName}. I'll remember that ${payer} pays for them.` : `Linked to ${tenantName}.`;
}

export function propertyBookedMessage(propertyName: string): string {
  return `Booked to ${propertyName}.`;
}
