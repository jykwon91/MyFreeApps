import { describe, expect, it } from "vitest";
import type { TransactionListPage } from "../types/transaction/TransactionListPage";
import { drillDownAmountTotal, drillDownListParams } from "../utils/drillDown";

function aPage(amountTotal: string): TransactionListPage {
  return { items: [], total: 0, has_more: false, amount_total: amountTotal };
}

describe("drillDownListParams", () => {
  it("asks for the approved rows in the range and category, with no cap on how many", () => {
    expect(drillDownListParams({ category: "utilities", startDate: "2026-01-01", endDate: "2026-01-31", propertyId: "p1" })).toEqual({
      category: "utilities",
      property_id: "p1",
      unassigned: undefined,
      property_ids: undefined,
      categories: undefined,
      start_date: "2026-01-01",
      end_date: "2026-01-31",
      status: "approved",
      summary_kind: undefined,
    });
  });

  it("asks the server for only the revenue or expense categories", () => {
    expect(drillDownListParams({ type: "revenue" }).summary_kind).toBe("revenue");
    expect(drillDownListParams({ type: "expenses" }).summary_kind).toBe("expenses");
  });

  it("sends the chosen properties and categories to the server, so its count and total cover them", () => {
    const params = drillDownListParams({ type: "expenses", propertyIds: ["p1", "p2"], categories: ["utilities"] });
    expect(params.property_ids).toEqual(["p1", "p2"]);
    expect(params.categories).toEqual(["utilities"]);
  });

  it("asks for rows with no property, not for a property called unassigned, and drops the property allowlist", () => {
    const params = drillDownListParams({ propertyId: "unassigned", propertyIds: ["p2"] });
    expect(params.unassigned).toBe(true);
    expect(params.property_id).toBeUndefined();
    expect(params.property_ids).toBeUndefined();
  });
});

describe("drillDownAmountTotal", () => {
  it("reads the latest page's total, which the server sends as text", () => {
    expect(drillDownAmountTotal([aPage("10.00"), aPage("1234.56")])).toBe(1234.56);
  });

  it("is zero before any page loads, and never negative zero", () => {
    expect(drillDownAmountTotal([])).toBe(0);
    expect(Object.is(drillDownAmountTotal([aPage("-0.00")]), 0)).toBe(true);
  });
});
