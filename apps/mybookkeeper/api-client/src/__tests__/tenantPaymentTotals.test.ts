import { describe, expect, it } from "vitest";
import type { Transaction } from "../types/transaction/transaction";
import { tenantPaymentTotals } from "../utils/tenantPaymentTotals";

function payment(overrides: Partial<Transaction>): Transaction {
  return { amount: "1000.00", category: "rental_revenue", status: "approved", ...overrides } as Transaction;
}

describe("tenantPaymentTotals", () => {
  it("leaves out payments still waiting on review", () => {
    const rows = [payment({}), payment({ amount: "1200.00", status: "pending" }), payment({ amount: "300.00", status: "needs_review" })];

    expect(tenantPaymentTotals(rows).received).toBe(1000);
  });

  it("adds in whole cents, so it can't pick up a rounding residue", () => {
    expect(tenantPaymentTotals([payment({ amount: "0.10" }), payment({ amount: "0.20" })]).received).toBe(0.3);
  });

  it("reports approved deposits separately", () => {
    const rows = [payment({}), payment({ amount: "500.00", category: "security_deposit" }), payment({ amount: "500.00", category: "security_deposit", status: "pending" })];

    expect(tenantPaymentTotals(rows)).toEqual({ received: 1500, deposits: 500 });
  });
});
