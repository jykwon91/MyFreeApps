import { describe, expect, it } from "vitest";
import type { FinancialAccount } from "../types/financial-account/financial-account";
import type { PlaidLinkAccount } from "../types/plaid/plaid-link-account";
import {
  linkableFinancialAccounts,
  suggestPlaidAccountMatch,
  suggestPlaidAccountMatches,
} from "../utils/suggestPlaidAccountMatch";

function account(overrides: Partial<FinancialAccount>): FinancialAccount {
  return {
    id: "a1", organization_id: "o", user_id: "u", name: "Chase Checking", institution_name: null,
    account_type: "checking", classification: "asset", mask: "4321", currency: "USD",
    current_balance_cents: null, balance_as_of: null, closed_on: null, mortgage_id: null,
    default_transaction_scope: "personal", plaid_item_id: null, created_at: "", updated_at: "", ...overrides,
  };
}

const checking: PlaidLinkAccount = { id: "p1", name: "Plaid Checking", mask: "4321", type: "depository", subtype: "checking" };

describe("suggestPlaidAccountMatch", () => {
  it("suggests the one open, unsynced account with the same last digits", () => {
    expect(suggestPlaidAccountMatch(checking, [account({}), account({ id: "a2", mask: "9999" })])).toBe("a1");
  });

  it("never suggests across the balance sheet", () => {
    const card = account({ account_type: "credit_card", classification: "liability" });
    expect(suggestPlaidAccountMatch(checking, [card])).toBeNull();
  });

  it("makes no guess when two accounts share the digits", () => {
    expect(suggestPlaidAccountMatch(checking, [account({}), account({ id: "a2" })])).toBeNull();
  });

  it("skips closed accounts and ones already synced from a bank", () => {
    expect(suggestPlaidAccountMatch(checking, [account({ closed_on: "2026-01-01" })])).toBeNull();
    expect(suggestPlaidAccountMatch(checking, [account({ plaid_item_id: "item-1" })])).toBeNull();
  });

  it("makes no guess without a mask", () => {
    expect(suggestPlaidAccountMatch({ ...checking, mask: null }, [account({ mask: null })])).toBeNull();
  });
});

describe("suggestPlaidAccountMatches", () => {
  it("never gives the same existing account to two bank accounts", () => {
    const twin: PlaidLinkAccount = { ...checking, id: "p2" };
    expect(suggestPlaidAccountMatches([checking, twin], [account({})])).toEqual({ p1: "a1", p2: null });
  });
});

describe("linkableFinancialAccounts", () => {
  it("keeps only open accounts not synced from a bank", () => {
    const accounts = [account({}), account({ id: "a2", closed_on: "2026-01-01" }), account({ id: "a3", plaid_item_id: "i" })];
    expect(linkableFinancialAccounts(accounts).map((a) => a.id)).toEqual(["a1"]);
  });
});
