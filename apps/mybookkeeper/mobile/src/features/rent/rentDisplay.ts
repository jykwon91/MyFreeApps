import { RENT_CHARGE_STATUS_LABEL, RENT_CHARGE_TYPE_LABEL } from "@mybookkeeper/api-client/constants/rentLabels";
import type { RentCharge } from "@mybookkeeper/api-client/types/rent/rent-charge";
import type { RentLedgerResponse } from "@mybookkeeper/api-client/types/rent/rent-ledger-response";
import type { RentPayment } from "@mybookkeeper/api-client/types/rent/rent-payment";
import { proratedNote } from "@mybookkeeper/api-client/utils/rentProratedNote";
import { formatCurrency } from "@platform/core/utils/currency";
import { amountOf, appliedTo, partHeldAsCredit, RENT_MESSAGES, waivedBecause } from "../../constants/rent";
import { shortDate, spokenDate, spokenMoney } from "../transactions/transactionDisplay";

const LESS_THAN_A_CENT = 0.005;

export function isMoreThanACent(amount: number): boolean {
  return Math.abs(amount) >= LESS_THAN_A_CENT;
}

export function chargeTitle(charge: RentCharge): string {
  if (charge.charge_type === "rent") return charge.description || `${shortDate(charge.period_start)} – ${shortDate(charge.period_end)}`;
  return `${charge.description || RENT_CHARGE_TYPE_LABEL[charge.charge_type]} · ${shortDate(charge.due_date)}`;
}

/** Nothing is owed on a waived charge, so "$0 of $1,500" would read as all of it still due. */
export function chargeAmountText(charge: RentCharge): string {
  const amount = formatCurrency(charge.amount);
  return charge.status === "waived" ? amount : amountOf(formatCurrency(charge.allocated), amount);
}

export function chargeSpokenLabel(charge: RentCharge): string {
  const name = charge.description || RENT_CHARGE_TYPE_LABEL[charge.charge_type];
  const when = charge.charge_type === "rent" ? `${spokenDate(charge.period_start)} to ${spokenDate(charge.period_end)}` : `due ${spokenDate(charge.due_date)}`;
  const amount = spokenMoney(Number(charge.amount));
  const paid = charge.status === "waived" ? amount : `${spokenMoney(Number(charge.allocated))} of ${amount} paid`;
  const reason = charge.waived_at && charge.waived_reason ? waivedBecause(charge.waived_reason) : null;
  return [name, when, paid, RENT_CHARGE_STATUS_LABEL[charge.status].toLowerCase(), proratedNote(charge.full_amount), reason].filter(Boolean).join(", ");
}

export function rentPaymentNote(payment: RentPayment): string | null {
  const labels = [...new Set(payment.applied_to)];
  const credit = Number(payment.unapplied);
  const hasCredit = isMoreThanACent(credit);
  if (labels.length === 0) return hasCredit ? RENT_MESSAGES.heldAsCredit : null;
  return hasCredit ? `${appliedTo(labels)} · ${partHeldAsCredit(formatCurrency(credit))}` : appliedTo(labels);
}

/** With no rent to apply them to, every payment looks like credit, and calling it that would be wrong. */
export function rentNotesByPayment(ledger: RentLedgerResponse): Map<string, string> {
  const notes = new Map<string, string>();
  if (ledger.schedules.length === 0 && ledger.charges.length === 0) return notes;
  for (const payment of ledger.payments) {
    const note = rentPaymentNote(payment);
    if (note) notes.set(payment.transaction_id, note);
  }
  return notes;
}
