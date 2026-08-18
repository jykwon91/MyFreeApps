/**
 * Unit tests for overlaying a read statement onto the mortgage form.
 *
 * The rule under test is one-directional: a draft fills fields, it never blanks
 * them. The operator can type what they know, then reach for the statement, and
 * anything the reader didn't find has to leave their entry alone.
 */
import { describe, it, expect } from "vitest";
import { applyMortgageDraftToForm } from "@/shared/lib/mortgage-draft";
import { EMPTY_MORTGAGE_FORM } from "@/shared/lib/mortgage-form";
import type { MortgageDraft } from "@/shared/types/mortgage/mortgage-draft";

const EMPTY_DRAFT: MortgageDraft = {
  source_document_id: "55555555-5555-5555-5555-555555555555",
  lender: null,
  account_number: null,
  current_balance_cents: null,
  statement_date: null,
  original_principal_cents: null,
  interest_rate: null,
  rate_type: null,
  fixed_until: null,
  maturity_date: null,
  term_months: null,
  monthly_principal_cents: null,
  monthly_interest_cents: null,
  monthly_escrow_cents: null,
  notes: null,
  confidence: "low",
  warnings: [],
  unrepresented: [],
};

describe("applyMortgageDraftToForm", () => {
  it("fills the form from a fully read statement", () => {
    // 6734 Peerless, as its TDECU statement reads.
    const values = applyMortgageDraftToForm(EMPTY_MORTGAGE_FORM, {
      ...EMPTY_DRAFT,
      lender: "TDECU",
      account_number: "240224944",
      current_balance_cents: 33613735,
      statement_date: "2026-08-01",
      interest_rate: "7.125",
      rate_type: "fixed",
      monthly_principal_cents: 30156,
      monthly_interest_cents: 199582,
      monthly_escrow_cents: 87081,
    });

    expect(values.lender).toBe("TDECU");
    expect(values.accountNumber).toBe("240224944");
    expect(values.balanceDollars).toBe("336137.35");
    expect(values.statementDate).toBe("2026-08-01");
    expect(values.interestRate).toBe("7.125");
    expect(values.rateType).toBe("fixed");
    expect(values.monthlyPrincipalDollars).toBe("301.56");
    expect(values.monthlyInterestDollars).toBe("1995.82");
    expect(values.monthlyEscrowDollars).toBe("870.81");
  });

  it("leaves what the operator already typed alone", () => {
    const typed = { ...EMPTY_MORTGAGE_FORM, lender: "TDECU", notes: "mine" };
    const values = applyMortgageDraftToForm(typed, EMPTY_DRAFT);
    expect(values.lender).toBe("TDECU");
    expect(values.notes).toBe("mine");
  });

  it("never overwrites the operator's own notes with the reader's", () => {
    // The notes field is where they keep their own record of the loan.
    const typed = { ...EMPTY_MORTGAGE_FORM, notes: "Refi quote from Feb." };
    const values = applyMortgageDraftToForm(typed, {
      ...EMPTY_DRAFT,
      notes: "Statement covers the August billing cycle.",
    });
    expect(values.notes).toBe("Refi quote from Feb.");
  });

  it("ignores a rate type the form has no option for", () => {
    // A reader that answers "variable-ish" must not put the select into a
    // state the operator cannot see or correct.
    const values = applyMortgageDraftToForm(EMPTY_MORTGAGE_FORM, {
      ...EMPTY_DRAFT,
      rate_type: "variable-ish",
    });
    expect(values.rateType).toBe("");
  });

  it("carries an adjustable loan's reset date across", () => {
    // 6732 Peerless: "Interest Rate Until February, 2035".
    const values = applyMortgageDraftToForm(EMPTY_MORTGAGE_FORM, {
      ...EMPTY_DRAFT,
      rate_type: "arm",
      fixed_until: "2035-02-01",
    });
    expect(values.rateType).toBe("arm");
    expect(values.fixedUntil).toBe("2035-02-01");
  });

  it("renders a zero payment as a real zero, not as unread", () => {
    // A paid-ahead loan bills $0 this month, which is a fact the statement
    // states rather than a field it omitted.
    const values = applyMortgageDraftToForm(EMPTY_MORTGAGE_FORM, {
      ...EMPTY_DRAFT,
      monthly_principal_cents: 0,
    });
    expect(values.monthlyPrincipalDollars).toBe("0");
  });
});
