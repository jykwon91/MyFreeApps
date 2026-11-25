import { describe, expect, it } from "vitest";
import { expenseAccountLabel } from "../utils/expenseAccountLabel";

describe("expenseAccountLabel", () => {
  it("names the account, its last digits and its bank", () => {
    expect(expenseAccountLabel({ account_name: "Checking", account_institution: "TDECU", account_mask: "4821" }))
      .toBe("Checking ··4821 · TDECU");
  });

  it("leaves out what it doesn't know or what repeats the name", () => {
    expect(expenseAccountLabel({ account_name: "Wise", account_institution: "Wise", account_mask: null })).toBe("Wise");
    expect(expenseAccountLabel({ account_name: "Cash", account_institution: null, account_mask: null })).toBe("Cash");
  });

  it("is null for a payment with no account", () => {
    expect(expenseAccountLabel({ account_name: null, account_institution: null, account_mask: null })).toBeNull();
  });
});
