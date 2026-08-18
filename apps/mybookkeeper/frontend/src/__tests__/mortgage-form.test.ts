/**
 * Unit tests for the mortgage form ⇄ API conversion.
 *
 * The cases that matter are the ones where a blank field could be mistaken for
 * a real value: a blank balance must not post a zero (which would read as a
 * paid-off loan), and a reset date left over from an earlier answer must not
 * ride along on a fixed-rate loan the row would then reject.
 */
import { describe, it, expect } from "vitest";
import {
  EMPTY_MORTGAGE_FORM,
  dollarsToCents,
  mortgageToFormValues,
  toMortgagePayload,
} from "@/shared/lib/mortgage-form";
import type { Mortgage } from "@/shared/types/mortgage/mortgage";

const MORTGAGE: Mortgage = {
  id: "11111111-1111-1111-1111-111111111111",
  user_id: "22222222-2222-2222-2222-222222222222",
  organization_id: "33333333-3333-3333-3333-333333333333",
  property_id: "44444444-4444-4444-4444-444444444444",
  property_name: "6738 Peerless",
  source_document_id: null,
  lender: "Chase",
  account_number: "1395862051",
  current_balance_cents: 7846278,
  statement_date: "2026-08-01",
  original_principal_cents: 9205000,
  interest_rate: "2.990",
  rate_type: "fixed",
  fixed_until: null,
  maturity_date: "2051-02-01",
  term_months: 360,
  monthly_principal_cents: 19209,
  monthly_interest_cents: 19550,
  monthly_escrow_cents: 73567,
  notes: "Owner-occupied pricing at origination.",
  created_at: "2026-08-17T00:00:00Z",
  updated_at: "2026-08-17T00:00:00Z",
};

describe("dollarsToCents", () => {
  it("converts dollars to integer cents", () => {
    expect(dollarsToCents("1995.82")).toBe(199582);
  });

  it("returns null for a blank field rather than a zero", () => {
    // Number("") is 0. A zero balance on a mortgage means "paid off", which
    // is a claim the operator never made by leaving the box empty.
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents("   ")).toBeNull();
  });

  it("returns null for an unparseable entry", () => {
    expect(dollarsToCents("about three hundred")).toBeNull();
  });

  it("keeps a deliberate zero", () => {
    expect(dollarsToCents("0")).toBe(0);
  });

  it("rounds rather than truncating a third decimal", () => {
    expect(dollarsToCents("10.005")).toBe(1001);
  });
});

describe("toMortgagePayload", () => {
  it("posts nulls for every field the operator left blank", () => {
    const payload = toMortgagePayload({
      ...EMPTY_MORTGAGE_FORM,
      rateType: "fixed",
    });
    expect(payload.rate_type).toBe("fixed");
    expect(payload.lender).toBeNull();
    expect(payload.account_number).toBeNull();
    expect(payload.current_balance_cents).toBeNull();
    expect(payload.statement_date).toBeNull();
    expect(payload.term_months).toBeNull();
    expect(payload.notes).toBeNull();
  });

  it("drops a reset date once the loan is marked fixed", () => {
    // The operator may have typed the date, then corrected the rate type.
    // Posting the stale half would fail the row's check constraint and lose
    // the correction they just made.
    const payload = toMortgagePayload({
      ...EMPTY_MORTGAGE_FORM,
      rateType: "fixed",
      fixedUntil: "2035-02-01",
    });
    expect(payload.fixed_until).toBeNull();
  });

  it("keeps a reset date on an adjustable loan", () => {
    const payload = toMortgagePayload({
      ...EMPTY_MORTGAGE_FORM,
      rateType: "arm",
      fixedUntil: "2035-02-01",
    });
    expect(payload.fixed_until).toBe("2035-02-01");
  });

  it("sends the rate as typed so the note's precision survives", () => {
    const payload = toMortgagePayload({
      ...EMPTY_MORTGAGE_FORM,
      rateType: "fixed",
      interestRate: "2.990",
    });
    expect(payload.interest_rate).toBe("2.990");
  });

  it("converts the payment split into cents", () => {
    const payload = toMortgagePayload({
      ...EMPTY_MORTGAGE_FORM,
      rateType: "fixed",
      monthlyPrincipalDollars: "301.56",
      monthlyInterestDollars: "1995.82",
      monthlyEscrowDollars: "870.81",
    });
    expect(payload.monthly_principal_cents).toBe(30156);
    expect(payload.monthly_interest_cents).toBe(199582);
    expect(payload.monthly_escrow_cents).toBe(87081);
  });

  it("trims whitespace off text rather than storing it", () => {
    const payload = toMortgagePayload({
      ...EMPTY_MORTGAGE_FORM,
      rateType: "fixed",
      lender: "  TDECU  ",
    });
    expect(payload.lender).toBe("TDECU");
  });
});

describe("mortgageToFormValues", () => {
  it("round-trips a stored loan back through the payload unchanged", () => {
    const payload = toMortgagePayload(mortgageToFormValues(MORTGAGE));
    expect(payload.lender).toBe("Chase");
    expect(payload.account_number).toBe("1395862051");
    expect(payload.interest_rate).toBe("2.990");
    expect(payload.rate_type).toBe("fixed");
    expect(payload.current_balance_cents).toBe(7846278);
    expect(payload.statement_date).toBe("2026-08-01");
    expect(payload.original_principal_cents).toBe(9205000);
    expect(payload.maturity_date).toBe("2051-02-01");
    expect(payload.term_months).toBe(360);
    expect(payload.monthly_principal_cents).toBe(19209);
    expect(payload.monthly_interest_cents).toBe(19550);
    expect(payload.monthly_escrow_cents).toBe(73567);
    expect(payload.notes).toBe("Owner-occupied pricing at origination.");
  });

  it("renders unrecorded fields as empty strings, not the literal null", () => {
    const values = mortgageToFormValues({
      ...MORTGAGE,
      lender: null,
      interest_rate: null,
      term_months: null,
      current_balance_cents: null,
    });
    expect(values.lender).toBe("");
    expect(values.interestRate).toBe("");
    expect(values.termMonths).toBe("");
    expect(values.balanceDollars).toBe("");
  });
});
