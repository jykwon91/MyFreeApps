import { describe, it, expect } from "vitest";
import { inferPaymentMethod } from "@/app/features/receipts/inferPaymentMethod";
import type { Transaction } from "@/shared/types/transaction/transaction";

function txn(overrides: Partial<Transaction>): Transaction {
  return {
    vendor: null,
    payment_method: null,
    ...overrides,
  } as Transaction;
}

describe("inferPaymentMethod", () => {
  it("returns an explicit payment_method verbatim when already set", () => {
    expect(inferPaymentMethod(txn({ payment_method: "zelle", vendor: "Anything" }))).toBe("zelle");
  });

  it("maps a Zelle vendor to the specific Zelle rail, not generic bank_transfer", () => {
    expect(inferPaymentMethod(txn({ vendor: "Zelle" }))).toBe("zelle");
    expect(inferPaymentMethod(txn({ vendor: "Zelle from Tushar Kapoor" }))).toBe("zelle");
  });

  it("maps other P2P rails to their specific values", () => {
    expect(inferPaymentMethod(txn({ vendor: "Venmo" }))).toBe("venmo");
    expect(inferPaymentMethod(txn({ vendor: "Cash App" }))).toBe("cash_app");
    expect(inferPaymentMethod(txn({ vendor: "CashApp" }))).toBe("cash_app");
    expect(inferPaymentMethod(txn({ vendor: "PayPal" }))).toBe("paypal");
  });

  it("does not let 'Cash App' fall through to the generic cash rail", () => {
    // "cash app".includes("cash") is true, so cash_app must be matched first.
    expect(inferPaymentMethod(txn({ vendor: "Cash App" }))).not.toBe("cash");
  });

  it("keeps ACH / wire / direct deposit on the generic bank_transfer rail", () => {
    expect(inferPaymentMethod(txn({ vendor: "ACH credit" }))).toBe("bank_transfer");
    expect(inferPaymentMethod(txn({ vendor: "Wire transfer" }))).toBe("bank_transfer");
    expect(inferPaymentMethod(txn({ vendor: "Direct Deposit" }))).toBe("bank_transfer");
  });

  it("maps OTA / wallet payouts to platform_payout", () => {
    expect(inferPaymentMethod(txn({ vendor: "Airbnb" }))).toBe("platform_payout");
    expect(inferPaymentMethod(txn({ vendor: "Apple Pay" }))).toBe("platform_payout");
  });

  it("returns empty string when the vendor gives no confident signal", () => {
    expect(inferPaymentMethod(txn({ vendor: "" }))).toBe("");
    expect(inferPaymentMethod(txn({ vendor: "Some Random LLC" }))).toBe("");
  });
});
