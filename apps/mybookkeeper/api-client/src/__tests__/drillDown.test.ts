import { describe, expect, it } from "vitest";
import type { Transaction } from "../types/transaction/transaction";
import { drillDownListParams, drillDownTotal, filterDrillDownTransactions, isDrillDownTruncated } from "../utils/drillDown";

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
      summary_kind: undefined,
      active_properties_only: true,
      limit: 5000,
    });
  });

  it("asks the server for only the revenue or expense categories", () => {
    expect(drillDownListParams({ label: "x", type: "revenue" }).summary_kind).toBe("revenue");
    expect(drillDownListParams({ label: "x", type: "expenses" }).summary_kind).toBe("expenses");
  });

  it("asks for rows with no property, not for a property called unassigned", () => {
    const params = drillDownListParams({ label: "x", propertyId: "unassigned" });
    expect(params.unassigned).toBe(true);
    expect(params.property_id).toBeUndefined();
  });
});

describe("filterDrillDownTransactions", () => {
  const rows = [
    aTransaction({ id: "a", transaction_type: "income", category: "rental_revenue", property_id: "p1" }),
    aTransaction({ id: "b", transaction_type: "expense", category: "maintenance", property_id: "p2" }),
    aTransaction({ id: "c", transaction_type: "expense", category: "utilities", property_id: null }),
    aTransaction({ id: "d", transaction_type: "income", category: "security_deposit", property_id: "p1" }),
    aTransaction({ id: "e", transaction_type: "income", category: "uncategorized", property_id: "p1" }),
  ];

  it("keeps revenue and expenses by category, as the summary counts them, not by transaction type", () => {
    expect(filterDrillDownTransactions(rows, { label: "x", type: "revenue" }).map((t) => t.id)).toEqual(["a"]);
    expect(filterDrillDownTransactions(rows, { label: "x", type: "expenses" }).map((t) => t.id)).toEqual(["b", "c"]);
  });

  it("keeps only the categories the category filter left on", () => {
    expect(filterDrillDownTransactions(rows, { label: "x", type: "expenses", categories: ["utilities"] }).map((t) => t.id)).toEqual(["c"]);
  });

  it("adds up to the figure the summary showed for that kind", () => {
    const priced = [
      aTransaction({ id: "r", category: "rental_revenue", transaction_type: "income", amount: "1000.00" }),
      aTransaction({ id: "m", category: "maintenance", amount: "200.00" }),
      aTransaction({ id: "u", category: "utilities", amount: "100.00" }),
      aTransaction({ id: "dep", category: "security_deposit", transaction_type: "income", amount: "500.00" }),
    ];
    expect(drillDownTotal(filterDrillDownTransactions(priced, { label: "x", type: "revenue" }))).toBe(1000);
    expect(drillDownTotal(filterDrillDownTransactions(priced, { label: "x", type: "expenses" }))).toBe(300);
  });

  it("keeps only the chosen properties", () => {
    expect(filterDrillDownTransactions(rows, { label: "x", propertyIds: ["p2"] }).map((t) => t.id)).toEqual(["b"]);
  });

  it("does not apply the chosen properties to the unassigned bucket", () => {
    expect(filterDrillDownTransactions(rows, { label: "x", propertyId: "unassigned", propertyIds: ["p2"] })).toHaveLength(5);
  });
});

describe("drillDownTotal", () => {
  it("adds amounts that arrive as text, and counts an unreadable one as nothing", () => {
    expect(drillDownTotal([aTransaction({ amount: "10.50" }), aTransaction({ amount: "2.25" }), aTransaction({ amount: "n/a" })])).toBeCloseTo(12.75);
  });
});

describe("isDrillDownTruncated", () => {
  it("is true only when the list reached the server's limit", () => {
    expect(isDrillDownTruncated(Array.from({ length: 4999 }, () => aTransaction({})))).toBe(false);
    expect(isDrillDownTruncated(Array.from({ length: 5000 }, () => aTransaction({})))).toBe(true);
  });
});
