import { describe, expect, it } from "vitest";
import type { SummaryResponse } from "../types/summary/summary";
import {
  ALL_SUMMARY_CATEGORIES,
  categoriesForPreset,
  detectCategoryPreset,
  filterSummaryByCategories,
  isCategoryFilterActive,
  toggleCategory,
} from "../utils/categoryFilter";

const SUMMARY: SummaryResponse = {
  revenue: 1000,
  expenses: 300,
  profit: 700,
  by_category: { rental_revenue: 1000, maintenance: 200, utilities: 100, security_deposit: 500 },
  by_property: [{ property_id: "p1", name: "Oak", revenue: 1000, expenses: 300, profit: 700 }],
  by_month: [{ month: "2026-01", revenue: 1000, expenses: 300, profit: 700 }],
  by_month_expense: [{ month: "2026-01", maintenance: 200, utilities: 100 }],
  by_property_month: [],
};

describe("category presets", () => {
  it("has every category, income only, or expenses only", () => {
    expect(categoriesForPreset("all")).toEqual(ALL_SUMMARY_CATEGORIES);
    expect([...categoriesForPreset("income")].sort()).toEqual(["business_income", "cleaning_fee_revenue", "rental_revenue"]);
    expect(categoriesForPreset("expenses").has("maintenance")).toBe(true);
    expect(categoriesForPreset("expenses").has("rental_revenue")).toBe(false);
  });

  it("recognises a preset from its categories", () => {
    expect(detectCategoryPreset(categoriesForPreset("income"))).toBe("income");
    expect(detectCategoryPreset(categoriesForPreset("expenses"))).toBe("expenses");
    expect(detectCategoryPreset(new Set(["maintenance", "rental_revenue"]))).toBe("all");
  });

  it("knows when the filter is on", () => {
    expect(isCategoryFilterActive(categoriesForPreset("all"))).toBe(false);
    expect(isCategoryFilterActive(categoriesForPreset("income"))).toBe(true);
  });
});

describe("toggleCategory", () => {
  it("adds and removes", () => {
    expect(toggleCategory(new Set(["a", "b"]), "a")).toEqual(new Set(["b"]));
    expect(toggleCategory(new Set(["b"]), "a")).toEqual(new Set(["a", "b"]));
  });

  it("does not turn off the last category", () => {
    expect(toggleCategory(new Set(["a"]), "a")).toEqual(new Set(["a"]));
  });
});

describe("filterSummaryByCategories", () => {
  it("adds up only the chosen categories", () => {
    const filtered = filterSummaryByCategories(SUMMARY, new Set(["maintenance"]));
    expect(filtered.revenue).toBe(0);
    expect(filtered.expenses).toBe(200);
    expect(filtered.profit).toBe(-200);
    expect(filtered.by_category).toEqual({ maintenance: 200 });
    expect(filtered.by_month).toEqual([{ month: "2026-01", revenue: 0, expenses: 200, profit: -200 }]);
    expect(filtered.by_month_expense).toEqual([{ month: "2026-01", maintenance: 200 }]);
  });

  it("keeps revenue by month when an income category is chosen", () => {
    const filtered = filterSummaryByCategories(SUMMARY, new Set(["rental_revenue"]));
    expect(filtered.by_month).toEqual([{ month: "2026-01", revenue: 1000, expenses: 0, profit: 1000 }]);
  });

  it("leaves the property sections alone and counts a deposit as neither income nor expense", () => {
    const filtered = filterSummaryByCategories(SUMMARY, new Set(["security_deposit"]));
    expect(filtered.revenue).toBe(0);
    expect(filtered.expenses).toBe(0);
    expect(filtered.by_property).toBe(SUMMARY.by_property);
  });
});
