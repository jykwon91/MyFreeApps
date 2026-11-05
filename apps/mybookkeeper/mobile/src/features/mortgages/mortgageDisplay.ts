import type { Mortgage } from "@mybookkeeper/api-client/types/mortgage/mortgage";
import { formatMoneyCents } from "@mybookkeeper/api-client/utils/mortgageFormat";
import { formatCurrency } from "@platform/core/utils/currency";
import { MORTGAGE_MESSAGES } from "../../constants/mortgages";
import { fullDateLabel } from "../../lib/localDate";

export function mortgageTitle(mortgage: Pick<Mortgage, "property_name">): string {
  return mortgage.property_name ?? MORTGAGE_MESSAGES.unassigned;
}

export function sortedMortgages<Loan extends Mortgage>(mortgages: readonly Loan[]): Loan[] {
  return [...mortgages].sort(
    (a, b) => mortgageTitle(a).localeCompare(mortgageTitle(b)) || (a.lender ?? "").localeCompare(b.lender ?? ""),
  );
}

export function balanceLine(mortgage: Pick<Mortgage, "current_balance_cents" | "statement_date">): string | null {
  if (mortgage.current_balance_cents === null) return null;
  const amount = formatMoneyCents(mortgage.current_balance_cents);
  return mortgage.statement_date ? `${amount} as of ${fullDateLabel(mortgage.statement_date)}` : amount;
}

export function rateFixedLine(mortgage: Pick<Mortgage, "rate_type" | "fixed_until">, todayIso: string): string | null {
  if (mortgage.rate_type !== "arm" || !mortgage.fixed_until) return null;
  const date = fullDateLabel(mortgage.fixed_until);
  return mortgage.fixed_until < todayIso ? `Rate stopped being fixed on ${date}` : `Rate fixed until ${date}`;
}

function paymentAmount(cents: number): string {
  return formatCurrency(cents / 100);
}

/** To the cent, so the lines add up to the total. */
export function paymentLines(mortgage: Mortgage): { label: string; value: string }[] {
  const { monthly_principal_cents: principal, monthly_interest_cents: interest, monthly_escrow_cents: escrow } = mortgage;
  const lines: { label: string; value: string }[] = [];
  if (principal !== null && interest !== null) {
    lines.push({ label: MORTGAGE_MESSAGES.principalAndInterest, value: paymentAmount(principal + interest) });
  } else {
    if (principal !== null) lines.push({ label: MORTGAGE_MESSAGES.principal, value: paymentAmount(principal) });
    if (interest !== null) lines.push({ label: MORTGAGE_MESSAGES.interest, value: paymentAmount(interest) });
  }
  if (escrow !== null) lines.push({ label: MORTGAGE_MESSAGES.escrow, value: paymentAmount(escrow) });
  if (principal !== null && interest !== null && escrow !== null) {
    lines.push({ label: MORTGAGE_MESSAGES.monthlyTotal, value: paymentAmount(principal + interest + escrow) });
  }
  return lines;
}
