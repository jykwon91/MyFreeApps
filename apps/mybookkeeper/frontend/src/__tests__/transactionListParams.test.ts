import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS } from "@/shared/lib/transaction-config";
import { DEFAULT_TRANSACTION_SORTING } from "@/shared/lib/transaction-sort-columns";
import { clampPage } from "@/shared/utils/clamp-page";
import { toTransactionListParams } from "@/shared/utils/transaction-list-params";

describe("toTransactionListParams", () => {
  it("sends each header filter as the server's any-of list", () => {
    expect(
      toTransactionListParams(
        { ...EMPTY_FILTERS, status: "pending" },
        [
          { id: "status", value: ["pending", "needs_review"] },
          { id: "transaction_type", value: ["income"] },
          { id: "category", value: ["rent", "utilities"] },
          { id: "property_id", value: ["p1", "unassigned"] },
        ],
        [],
      ),
    ).toEqual({
      status: "pending",
      statuses: ["pending", "needs_review"],
      transaction_types: ["income"],
      categories: ["rent", "utilities"],
      property_ids: ["p1", "unassigned"],
    });
  });

  it("narrows by tax only when one of Yes and No is ticked", () => {
    expect(toTransactionListParams(EMPTY_FILTERS, [{ id: "tax_relevant", value: ["false"] }], [])).toEqual({ tax_relevant: false });
    expect(toTransactionListParams(EMPTY_FILTERS, [{ id: "tax_relevant", value: ["true", "false"] }], [])).toEqual({});
  });

  it("keeps the dates both the filter bar and the Date header allow", () => {
    expect(
      toTransactionListParams(
        { ...EMPTY_FILTERS, start_date: "2025-01-01", end_date: "2025-12-31" },
        [{ id: "transaction_date", value: ["2025-03-01", ""] }],
        [],
      ),
    ).toEqual({ start_date: "2025-03-01", end_date: "2025-12-31" });
    expect(toTransactionListParams(EMPTY_FILTERS, [{ id: "transaction_date", value: ["", "2025-06-30"] }], [])).toEqual({
      end_date: "2025-06-30",
    });
  });

  it("orders by the sorted column, Property and Tax included", () => {
    expect(toTransactionListParams(EMPTY_FILTERS, [], DEFAULT_TRANSACTION_SORTING)).toEqual({ sort: ["transaction_date:desc"] });
    expect(toTransactionListParams(EMPTY_FILTERS, [], [{ id: "property_id", desc: false }])).toEqual({ sort: ["property_id:asc"] });
    expect(toTransactionListParams(EMPTY_FILTERS, [], [{ id: "tax_relevant", desc: true }])).toEqual({ sort: ["tax_relevant:desc"] });
  });

  it("sends every shift-clicked column in order, most significant first", () => {
    expect(
      toTransactionListParams(EMPTY_FILTERS, [], [
        { id: "property_id", desc: false },
        { id: "amount", desc: true },
        { id: "select", desc: false },
      ]),
    ).toEqual({ sort: ["property_id:asc", "amount:desc"] });
  });

  it("leaves the order to the server when nothing is sorted", () => {
    expect(toTransactionListParams(EMPTY_FILTERS, [], [])).toEqual({});
  });
});

describe("clampPage", () => {
  it("moves back to the last page once rows are gone", () => {
    expect(clampPage({ pageIndex: 4, pageSize: 25 }, 60)).toEqual({ pageIndex: 2, pageSize: 25 });
    expect(clampPage({ pageIndex: 1, pageSize: 25 }, 0)).toEqual({ pageIndex: 0, pageSize: 25 });
    expect(clampPage({ pageIndex: 1, pageSize: 25 }, 60)).toEqual({ pageIndex: 1, pageSize: 25 });
    expect(clampPage({ pageIndex: 9, pageSize: 25 }, null)).toEqual({ pageIndex: 9, pageSize: 25 });
  });
});
