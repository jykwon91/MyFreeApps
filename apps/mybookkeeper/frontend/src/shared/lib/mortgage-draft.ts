import type { MortgageDraft } from "@/shared/types/mortgage/mortgage-draft";
import type { MortgageFormValues } from "@/shared/types/mortgage/mortgage-form-values";
import { MORTGAGE_RATE_TYPES } from "@/shared/types/mortgage/mortgage-rate-type";
import type { MortgageRateType } from "@/shared/types/mortgage/mortgage-rate-type";

/**
 * Turning a read statement into form state.
 *
 * Pure and separate from the dialog so the merge rule is testable on its own.
 * That rule is the whole point: a draft only ever *fills* the form, it never
 * blanks it. The operator may have typed the lender before reaching for the
 * statement, and a field the statement didn't state must not erase it.
 */

function centsToDollarString(value: number | null): string | null {
  if (value === null) return null;
  return String(value / 100);
}

function asRateType(value: string | null): MortgageRateType | null {
  return MORTGAGE_RATE_TYPES.includes(value as MortgageRateType)
    ? (value as MortgageRateType)
    : null;
}

function numberToString(value: number | null): string | null {
  return value === null ? null : String(value);
}

function draftedFields(draft: MortgageDraft): Partial<MortgageFormValues> {
  const candidates: Partial<Record<keyof MortgageFormValues, unknown>> = {
    lender: draft.lender,
    accountNumber: draft.account_number,
    rateType: asRateType(draft.rate_type),
    interestRate: draft.interest_rate,
    fixedUntil: draft.fixed_until,
    balanceDollars: centsToDollarString(draft.current_balance_cents),
    statementDate: draft.statement_date,
    originalPrincipalDollars: centsToDollarString(draft.original_principal_cents),
    maturityDate: draft.maturity_date,
    termMonths: numberToString(draft.term_months),
    monthlyPrincipalDollars: centsToDollarString(draft.monthly_principal_cents),
    monthlyInterestDollars: centsToDollarString(draft.monthly_interest_cents),
    monthlyEscrowDollars: centsToDollarString(draft.monthly_escrow_cents),
  };

  const set: Partial<MortgageFormValues> = {};
  for (const [key, value] of Object.entries(candidates)) {
    if (value !== null) {
      Object.assign(set, { [key]: value });
    }
  }
  return set;
}

/** Overlay a draft onto the current form values. */
export function applyMortgageDraftToForm(
  values: MortgageFormValues,
  draft: MortgageDraft,
): MortgageFormValues {
  return { ...values, ...draftedFields(draft) };
}

/*
 * ``notes`` is deliberately absent above — same reason as the insurance and
 * utility readers. It is where the operator keeps their own record of the loan,
 * and overwriting it with a model's summary would cost them something they
 * wrote. ``DocumentDraftNotices`` still renders the reader's note, unedited.
 */
