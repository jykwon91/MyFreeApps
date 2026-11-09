import { describe, expect, it } from "vitest";
import type { Transaction } from "../types/transaction/transaction";
import { drillDownListParams, drillDownTotal, filterDrillDownTransactions } from "../utils/drillDown";

function aTransaction(overrides: Partial<Transaction>): Transaction {
  return { id: "t", property_id: "p1", transaction_type: "expense", amount: "10.00", ...overrides } as Transaction;
}

describe("drillDownListParams", () => {
  it("asks for the approved rows in the range and category", () => {
    expect(drillDownListParams({ label: "x", category: "utilities", startDate: "2026-01-01", endDate: "2026-01-31", propertyId: "p1" })).toEqual({
      category: "utilities",
      property_id: "p1",
      unassigned: undefined,
      start_date: "2026-01-01",
      end_date: "2026-01-31",
      status: "approved",
    });
  });

  it("asks for rows with no property, not for a property called unassigned", () => {
    const params = drillDownListParams({ label: "x", propertyId: "unassigned" });
    expect(params.unassigned).toBe(true);
    expect(params.property_id).toBeUndefined();
  });
});

describe("filterDrillDownTransactions", () => {
  const rows = [
    aTransaction({ id: "a", transaction_type: "income", property_id: "p1" }),
    aTransaction({ id: "b", transaction_type: "expense", property_id: "p2" }),
    aTransaction({ id: "c", transaction_type: "expense", property_id: null }),
  ];

  it("keeps revenue as income and expenses as expense", () => {
    expect(filterDrillDownTransactions(rows, { label: "x", type: "revenue" }).map((t) => t.id)).toEqual(["a"]);
    expect(filterDrillDownTransactions(rows, { label: "x", type: "expenses" }).map((t) => t.id)).toEqual(["b", "c"]);
  });

  it("keeps only the chosen properties", () => {
    expect(filterDrillDownTransactions(rows, { label: "x", propertyIds: ["p2"] }).map((t) => t.id)).toEqual(["b"]);
  });

  it("does not apply the chosen properties to the unassigned bucket", () => {
    expect(filterDrillDownTransactions(rows, { label: "x", propertyId: "unassigned", propertyIds: ["p2"] })).toHaveLength(3);
  });
});

describe("drillDownTotal", () => {
  it("adds amounts that arrive as text, and counts an unreadable one as nothing", () => {
    expect(drillDownTotal([aTransaction({ amount: "10.50" }), aTransaction({ amount: "2.25" }), aTransaction({ amount: "n/a" })])).toBeCloseTo(12.75);
  });
});
