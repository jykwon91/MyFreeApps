import type { Mortgage } from "../types/mortgage/mortgage";
import type { MortgageFormValues } from "../types/mortgage/mortgage-form-values";
import type { MortgageRateType } from "../types/mortgage/mortgage-rate-type";
import type { DecimalSeparator } from "@platform/core/types/text/decimal-separator";
import { moneyTextToCents } from "./moneyTextToCents";

/**
 * Conversion between the mortgage form's text state and the API shape.
 *
 * Pure and shared by the add and edit dialogs so the two can never disagree on
 * what an empty field means or where the decimal point goes.
 */

export const EMPTY_MORTGAGE_FORM: MortgageFormValues = {
  lender: "",
  accountNumber: "",
  rateType: "",
  interestRate: "",
  fixedUntil: "",
  balanceDollars: "",
  statementDate: "",
  originalPrincipalDollars: "",
  maturityDate: "",
  termMonths: "",
  monthlyPrincipalDollars: "",
  monthlyInterestDollars: "",
  monthlyEscrowDollars: "",
  notes: "",
};

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Blank, or text the form check already refused, is no amount rather than a guessed one. */
function centsOrNull(text: string, decimalSeparator: DecimalSeparator): number | null {
  return moneyTextToCents(text, decimalSeparator) ?? null;
}

function intOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

/**
 * Form state → the field set both POST and PATCH accept.
 *
 * ``fixed_until`` is dropped on a fixed-rate loan rather than posted to fail:
 * the operator may have typed a reset date, then corrected the rate type, and
 * the row rejects the pair. Clearing the stale half here means the correction
 * they made is the one that survives.
 */
export function toMortgagePayload(values: MortgageFormValues, decimalSeparator: DecimalSeparator) {
  const rateType = values.rateType as MortgageRateType;
  return {
    rate_type: rateType,
    lender: textOrNull(values.lender),
    account_number: textOrNull(values.accountNumber),
    interest_rate: textOrNull(values.interestRate),
    fixed_until: rateType === "arm" ? values.fixedUntil || null : null,
    current_balance_cents: centsOrNull(values.balanceDollars, decimalSeparator),
    statement_date: values.statementDate || null,
    original_principal_cents: centsOrNull(values.originalPrincipalDollars, decimalSeparator),
    maturity_date: values.maturityDate || null,
    term_months: intOrNull(values.termMonths),
    monthly_principal_cents: centsOrNull(values.monthlyPrincipalDollars, decimalSeparator),
    monthly_interest_cents: centsOrNull(values.monthlyInterestDollars, decimalSeparator),
    monthly_escrow_cents: centsOrNull(values.monthlyEscrowDollars, decimalSeparator),
    notes: textOrNull(values.notes),
  };
}

function centsToDollars(cents: number | null): string {
  return cents === null ? "" : String(cents / 100);
}

/** A stored loan → the form state that edits it. */
export function mortgageToFormValues(mortgage: Mortgage): MortgageFormValues {
  return {
    lender: mortgage.lender ?? "",
    accountNumber: mortgage.account_number ?? "",
    rateType: mortgage.rate_type,
    interestRate: mortgage.interest_rate ?? "",
    fixedUntil: mortgage.fixed_until ?? "",
    balanceDollars: centsToDollars(mortgage.current_balance_cents),
    statementDate: mortgage.statement_date ?? "",
    originalPrincipalDollars: centsToDollars(mortgage.original_principal_cents),
    maturityDate: mortgage.maturity_date ?? "",
    termMonths: mortgage.term_months === null ? "" : String(mortgage.term_months),
    monthlyPrincipalDollars: centsToDollars(mortgage.monthly_principal_cents),
    monthlyInterestDollars: centsToDollars(mortgage.monthly_interest_cents),
    monthlyEscrowDollars: centsToDollars(mortgage.monthly_escrow_cents),
    notes: mortgage.notes ?? "",
  };
}
