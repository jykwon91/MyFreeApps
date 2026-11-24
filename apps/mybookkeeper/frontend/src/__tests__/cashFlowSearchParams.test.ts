import { describe, it, expect } from "vitest";
import { cashFlowQueryFrom, cashFlowSearchParams } from "@/app/features/cash-flow/cash-flow-search-params";

describe("cash flow search params", () => {
  it("falls back to the defaults for missing or unknown values", () => {
    expect(cashFlowQueryFrom(new URLSearchParams(""))).toEqual({ range: "6m", scope: "all", accountId: null });
    expect(cashFlowQueryFrom(new URLSearchParams("range=5y&scope=crypto&account="))).toEqual(
      { range: "6m", scope: "all", accountId: null },
    );
  });

  it("reads a picked range, scope and account", () => {
    expect(cashFlowQueryFrom(new URLSearchParams("range=ytd&scope=business&account=a1"))).toEqual(
      { range: "ytd", scope: "business", accountId: "a1" },
    );
  });

  it("writes only what differs from the defaults", () => {
    expect(cashFlowSearchParams({ range: "6m", scope: "all", accountId: null })).toEqual({});
    expect(cashFlowSearchParams({ range: "12m", scope: "rental", accountId: "a1" })).toEqual(
      { range: "12m", scope: "rental", account: "a1" },
    );
  });
});
