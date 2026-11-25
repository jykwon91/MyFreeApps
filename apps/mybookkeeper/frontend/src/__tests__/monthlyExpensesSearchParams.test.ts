import { describe, it, expect } from "vitest";
import {
  monthlyExpensesQueryFrom,
  monthlyExpensesSearchParams,
} from "@/app/features/monthly-expenses/monthly-expenses-search-params";

describe("monthly expenses search params", () => {
  it("falls back to six months of everything for missing or unknown values", () => {
    expect(monthlyExpensesQueryFrom(new URLSearchParams(""))).toEqual({ range: "6m", scope: "all" });
    expect(monthlyExpensesQueryFrom(new URLSearchParams("range=ytd&scope=crypto"))).toEqual({ range: "6m", scope: "all" });
  });

  it("reads a picked range and scope", () => {
    expect(monthlyExpensesQueryFrom(new URLSearchParams("range=12m&scope=rental"))).toEqual({ range: "12m", scope: "rental" });
  });

  it("writes only what differs from the defaults", () => {
    expect(monthlyExpensesSearchParams({ range: "6m", scope: "all" })).toEqual({});
    expect(monthlyExpensesSearchParams({ range: "3m", scope: "personal" })).toEqual({ range: "3m", scope: "personal" });
  });
});
