import { describe, expect, it } from "vitest";
import { FINANCIAL_ACCOUNT_CLASSIFICATION, FINANCIAL_ACCOUNT_TYPES } from "../constants/financialAccountTypes";
import type { FinancialAccount } from "../types/financial-account/financial-account";
import {
  EMPTY_FINANCIAL_ACCOUNT_FORM,
  balanceTextToCents,
  financialAccountFormProblems,
  financialAccountToFormValues,
  toFinancialAccountPayload,
} from "../utils/financialAccountForm";
import { financialAccountLabel } from "../utils/financialAccountLabel";
import { groupFinancialAccounts, selectableFinancialAccounts } from "../utils/groupFinancialAccounts";

const filled = { ...EMPTY_FINANCIAL_ACCOUNT_FORM, name: " Chase Checking ", accountType: "checking" };

function account(overrides: Partial<FinancialAccount>): FinancialAccount {
  return {
    id: "a1", organization_id: "o", user_id: "u", name: "Chase Checking", institution_name: null,
    account_type: "checking", classification: "asset", mask: null, currency: "USD",
    current_balance_cents: null, balance_as_of: null, closed_on: null, mortgage_id: null,
    default_transaction_scope: "personal", plaid_item_id: null,
    created_at: "", updated_at: "", ...overrides,
  };
}

describe("balanceTextToCents", () => {
  it("keeps a minus sign, since an overdraft is a real balance", () => {
    expect(balanceTextToCents("-25.50", ".")).toBe(-2550);
    expect(balanceTextToCents("1,234.56", ".")).toBe(123456);
    expect(balanceTextToCents("", ".")).toBeNull();
    expect(balanceTextToCents("abc", ".")).toBeUndefined();
  });
});

describe("financialAccountFormProblems", () => {
  it("needs a name and a type", () => {
    expect(financialAccountFormProblems(EMPTY_FINANCIAL_ACCOUNT_FORM, ".")).toEqual({
      name: "name_required", accountType: "type_required",
    });
  });

  it("refuses a full account number and a balance with no date", () => {
    expect(financialAccountFormProblems({ ...filled, mask: "123456789", balanceDollars: "10" }, ".")).toEqual({
      mask: "mask_format", balanceAsOf: "needs_balance_date",
    });
  });

  it("accepts a complete form", () => {
    expect(financialAccountFormProblems({ ...filled, mask: "4821", balanceDollars: "10", balanceAsOf: "2026-11-01" }, ".")).toEqual({});
  });
});

describe("toFinancialAccountPayload", () => {
  it("trims, sends blanks as null, and only a mortgage account carries a mortgage link", () => {
    expect(toFinancialAccountPayload({ ...filled, mortgageId: "m1", balanceAsOf: "2026-11-01" }, ".")).toEqual({
      name: "Chase Checking", account_type: "checking", institution_name: null, mask: null,
      current_balance_cents: null, balance_as_of: null, mortgage_id: null,
    });
    expect(toFinancialAccountPayload({ ...filled, accountType: "mortgage", mortgageId: "m1" }, ".").mortgage_id).toBe("m1");
  });

  it("round-trips a stored account", () => {
    const stored = account({ mask: "4821", current_balance_cents: -2550, balance_as_of: "2026-11-01" });
    const payload = toFinancialAccountPayload(financialAccountToFormValues(stored), ".");
    expect(payload).toMatchObject({ mask: "4821", current_balance_cents: -2550, balance_as_of: "2026-11-01" });
  });
});

describe("grouping and labels", () => {
  it("splits open accounts by classification and sets closed ones apart", () => {
    const groups = groupFinancialAccounts([
      account({ id: "a" }),
      account({ id: "l", account_type: "credit_card", classification: "liability" }),
      account({ id: "c", closed_on: "2026-01-01" }),
    ]);
    expect([groups.assets, groups.liabilities, groups.closed].map((g) => g.map((a) => a.id))).toEqual([["a"], ["l"], ["c"]]);
  });

  it("offers open accounts plus the one a transaction already names", () => {
    const list = [account({ id: "open" }), account({ id: "closed", closed_on: "2026-01-01" })];
    expect(selectableFinancialAccounts(list, null).map((a) => a.id)).toEqual(["open"]);
    expect(selectableFinancialAccounts(list, "closed").map((a) => a.id)).toEqual(["open", "closed"]);
  });

  it("shows the last digits when there are some", () => {
    expect(financialAccountLabel({ name: "Chase", mask: "4821" })).toBe("Chase ··4821");
    expect(financialAccountLabel({ name: "Cash", mask: null })).toBe("Cash");
  });

  it("classifies every type", () => {
    expect(Object.keys(FINANCIAL_ACCOUNT_CLASSIFICATION).sort()).toEqual([...FINANCIAL_ACCOUNT_TYPES].sort());
  });
});
