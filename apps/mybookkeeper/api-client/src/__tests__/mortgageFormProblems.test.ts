import { describe, expect, it } from "vitest";
import { EMPTY_MORTGAGE_FORM } from "../utils/mortgageForm";
import { mortgageFormProblems } from "../utils/mortgageFormProblems";

const FIXED = { ...EMPTY_MORTGAGE_FORM, rateType: "fixed" };

describe("mortgageFormProblems", () => {
  it("accepts a form with only the rate type filled in", () => {
    expect(mortgageFormProblems(FIXED, ".")).toEqual({});
  });

  it("asks for the rate type, which has no default", () => {
    expect(mortgageFormProblems(EMPTY_MORTGAGE_FORM, ".")).toEqual({ rateType: "rate_type_required" });
  });

  it("keeps the rate strictly between 0 and 25", () => {
    for (const bad of ["0", "-1", "25", "abc"]) {
      expect(mortgageFormProblems({ ...FIXED, interestRate: bad }, ".").interestRate).toBe("rate_out_of_range");
    }
    for (const good of ["0.001", "7.125", "24.999"]) {
      expect(mortgageFormProblems({ ...FIXED, interestRate: good }, ".").interestRate).toBeUndefined();
    }
  });

  it("rejects a negative or unreadable payment, but allows a real zero", () => {
    expect(mortgageFormProblems({ ...FIXED, monthlyEscrowDollars: "-5" }, ".").monthlyEscrowDollars).toBe("negative_amount");
    expect(mortgageFormProblems({ ...FIXED, monthlyInterestDollars: "12abc" }, ".").monthlyInterestDollars).toBe("not_a_number");
    expect(mortgageFormProblems({ ...FIXED, monthlyInterestDollars: "10.005" }, ".").monthlyInterestDollars).toBe("not_a_number");
    expect(mortgageFormProblems({ ...FIXED, monthlyEscrowDollars: "0" }, ".")).toEqual({});
  });

  it("needs an original amount above zero", () => {
    expect(mortgageFormProblems({ ...FIXED, originalPrincipalDollars: "0" }, ".").originalPrincipalDollars).toBe("must_be_positive");
    expect(mortgageFormProblems({ ...FIXED, originalPrincipalDollars: "92050" }, ".")).toEqual({});
  });

  it("keeps the term between 1 and 600 months", () => {
    expect(mortgageFormProblems({ ...FIXED, termMonths: "0" }, ".").termMonths).toBe("term_out_of_range");
    expect(mortgageFormProblems({ ...FIXED, termMonths: "601" }, ".").termMonths).toBe("term_out_of_range");
    expect(mortgageFormProblems({ ...FIXED, termMonths: "600" }, ".")).toEqual({});
  });

  it("takes a balance and its statement date together or not at all", () => {
    expect(mortgageFormProblems({ ...FIXED, balanceDollars: "1000" }, ".").statementDate).toBe("needs_statement_date");
    expect(mortgageFormProblems({ ...FIXED, statementDate: "2026-08-01" }, ".").balanceDollars).toBe("needs_balance");
    expect(mortgageFormProblems({ ...FIXED, balanceDollars: "0", statementDate: "2026-08-01" }, ".")).toEqual({});
  });

  it("reads a decimal comma on a comma phone and a pasted $1,250.50 on a dot phone", () => {
    const money = { monthlyEscrowDollars: "1250,50", balanceDollars: "1.250,50", statementDate: "2026-08-01" };
    expect(mortgageFormProblems({ ...FIXED, ...money }, ",")).toEqual({});
    expect(mortgageFormProblems({ ...FIXED, monthlyInterestDollars: "$1,250.50" }, ".")).toEqual({});
    expect(mortgageFormProblems({ ...FIXED, originalPrincipalDollars: "0,00" }, ",").originalPrincipalDollars).toBe("must_be_positive");
    expect(mortgageFormProblems({ ...FIXED, monthlyEscrowDollars: "-5,50" }, ",").monthlyEscrowDollars).toBe("negative_amount");
  });

  it("reads the rate in the phone's decimal mark, and the \".\" a saved loan is prefilled with", () => {
    for (const good of ["7,125", " 7,125 ", "0,001", "24,999", "7.125", "2.990"]) {
      expect(mortgageFormProblems({ ...FIXED, interestRate: good }, ",").interestRate).toBeUndefined();
    }
    for (const bad of ["25,0", "0,000", "-7,125", "7,1,25", "7.125,5"]) {
      expect(mortgageFormProblems({ ...FIXED, interestRate: bad }, ",").interestRate).toBe("rate_out_of_range");
    }
  });

  it("never reads a comma as the decimal mark on a \".\" phone, where it groups thousands", () => {
    expect(mortgageFormProblems({ ...FIXED, interestRate: "7,125" }, ".").interestRate).toBe("rate_out_of_range");
  });

  it("refuses a rate finer than the three decimals the server keeps, rather than letting it be rounded", () => {
    expect(mortgageFormProblems({ ...FIXED, interestRate: "7.1255" }, ".").interestRate).toBe("rate_decimals");
    expect(mortgageFormProblems({ ...FIXED, interestRate: "7,1255" }, ",").interestRate).toBe("rate_decimals");
    expect(mortgageFormProblems({ ...FIXED, interestRate: "7.1250" }, ".").interestRate).toBeUndefined();
  });
});
