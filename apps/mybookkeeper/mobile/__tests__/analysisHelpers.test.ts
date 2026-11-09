import type { SummaryResponse } from "@mybookkeeper/api-client/types/summary/summary";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../src/constants/moneyAnalysis";
import { analysisChoices, currentSelection, selectionComparison, selectionDates, selectionFor, selectionName, summaryDates } from "../src/features/analyticsControls/analysisPeriod";
import { changeIsGood, changeText, NO_CHANGE_TEXT, spokenChange } from "../src/features/analyticsControls/changeDisplay";
import { drillDownFilterFromParams, drillDownLink } from "../src/features/drillDown/drillDownLink";
import { categoriesValue } from "../src/features/moneyAnalysis/categoryFilterDisplay";
import { categoryGroups, isEmptySummary, monthExpenseRows, monthsNewestFirst } from "../src/features/moneyAnalysis/moneyAnalysisDisplay";
import { categoryDrillDown, kindDrillDown, monthDrillDown, propertyDrillDown, propertyMonthDrillDown } from "../src/features/moneyAnalysis/moneyAnalysisDrillDowns";

const TODAY = new Date(2026, 10, 9);

describe("analysisPeriod", () => {
  it("offers every preset, the years that have data, and all time", () => {
    const keys = analysisChoices(TODAY, [2026, 2024]).map((choice) => choice.key);
    expect(keys).toEqual(expect.arrayContaining(["this_month", "last_month", "this_quarter", "last_quarter", "ytd", "last_12_months", "last_year", "year_2026", "year_2024", "all_time"]));
    expect(keys).not.toContain("year_2025");
  });

  it("gives the dates each choice means, in the person's own calendar", () => {
    expect(selectionFor("ytd", new Date(2026, 11, 31, 23, 59)).range).toEqual({ since: "2026-01-01", until: "2026-12-31" });
    expect(selectionFor("last_month", TODAY).range).toEqual({ since: "2026-10-01", until: "2026-10-31" });
    expect(selectionFor("all_time", TODAY).range).toBeNull();
  });

  it("moves a preset on with the date, but leaves a year, all time and hand-picked dates alone", () => {
    const tomorrow = new Date(2026, 10, 10);
    expect(currentSelection(selectionFor("ytd", TODAY), tomorrow).range?.until).toBe("2026-11-10");
    const year = { key: "year_2025" as const, range: { since: "2025-01-01", until: "2025-12-31" } };
    expect(currentSelection(year, tomorrow)).toBe(year);
    const custom = { key: null, range: { since: "2026-02-03", until: "2026-02-09" } };
    expect(currentSelection(custom, tomorrow)).toBe(custom);
    const all = selectionFor("all_time", TODAY);
    expect(currentSelection(all, tomorrow)).toBe(all);
  });

  it("names the choice and its dates, and calls hand-picked dates a custom range", () => {
    const choices = analysisChoices(TODAY, []);
    expect(selectionName(selectionFor("ytd", TODAY), choices)).toBe("Year to date");
    expect(selectionName({ key: null, range: { since: "2026-02-03", until: "2026-02-09" } }, choices)).toBe(MESSAGES.customRange);
    expect(selectionDates(selectionFor("all_time", TODAY))).toBe("Every date");
  });

  it("sends no dates at all for all time", () => {
    expect(summaryDates(null)).toEqual({});
    expect(summaryDates({ since: "2026-01-01", until: "2026-02-01" })).toEqual({ startDate: "2026-01-01", endDate: "2026-02-01" });
  });

  it("has nothing to compare against with comparing off or no dates", () => {
    expect(selectionComparison(selectionFor("ytd", TODAY), "none")).toBeNull();
    expect(selectionComparison(selectionFor("all_time", TODAY), "previous_year")).toBeNull();
    expect(selectionComparison(selectionFor("last_month", TODAY), "previous_period")).toEqual({ since: "2026-09-01", until: "2026-09-30" });
    expect(selectionComparison(selectionFor("last_month", TODAY), "previous_year")).toEqual({ since: "2025-10-01", until: "2025-10-31" });
  });
});

describe("changeDisplay", () => {
  it("reads a rise and a fall in dollars and percent", () => {
    expect(changeText({ delta: 200, percent: 25 })).toBe("+$200.00 (+25%)");
    expect(changeText({ delta: -100, percent: -20 })).toBe("−$100.00 (-20%)");
  });

  it("gives no percentage when there was nothing before, and says so", () => {
    expect(changeText({ delta: 150, percent: null })).toBe("+$150.00 (nothing to compare with before)");
    expect(spokenChange({ delta: 150, percent: null }, "against last year")).toContain("nothing to compare with before");
  });

  it("says no change for a cent-level residue", () => {
    expect(changeText({ delta: 0.001, percent: 0 })).toBe(NO_CHANGE_TEXT);
    expect(changeIsGood({ delta: 0, percent: 0 }, true)).toBeNull();
  });

  it("counts a rise in expenses as bad news and a rise in revenue as good", () => {
    expect(changeIsGood({ delta: 5, percent: 5 }, true)).toBe(true);
    expect(changeIsGood({ delta: 5, percent: 5 }, false)).toBe(false);
    expect(changeIsGood({ delta: -5, percent: -5 }, false)).toBe(true);
  });
});

describe("drill-down links", () => {
  it("carries the filter in the address and reads it back", () => {
    const filter = { label: "Elm St, Revenue", propertyId: "p1", type: "revenue" as const, startDate: "2026-01-01", endDate: "2026-02-01", propertyIds: ["p1", "p2"] };
    const url = new URL(`http://x${drillDownLink(filter)}`);
    expect(url.pathname).toBe("/analytics/drill-down");
    const params = Object.fromEntries(url.searchParams.entries());
    expect(drillDownFilterFromParams(params)).toEqual({ ...filter, category: undefined });
  });

  it("leaves out what is not set, and ignores a type it does not know", () => {
    const filter = drillDownFilterFromParams({ label: "x", type: "bogus", category: "", from: "" });
    expect(filter).toEqual({ label: "x", category: undefined, propertyId: undefined, propertyIds: undefined, type: undefined, startDate: undefined, endDate: undefined });
  });

  it("builds each drill-down over the dates and properties the numbers were added up over", () => {
    const scope = { startDate: "2026-01-01", endDate: "2026-11-09", propertyIds: ["p2"] };
    expect(kindDrillDown("expenses", scope)).toMatchObject({ type: "expenses", ...scope });
    expect(categoryDrillDown("maintenance", scope)).toMatchObject({ category: "maintenance", label: "Maintenance", ...scope });
    expect(propertyDrillDown("p1", "Elm St", scope)).toEqual({ propertyId: "p1", label: "Elm St", startDate: "2026-01-01", endDate: "2026-11-09" });
    expect(monthDrillDown("2026-02", "revenue", scope)).toMatchObject({ type: "revenue", startDate: "2026-02-01", endDate: "2026-02-28", propertyIds: ["p2"] });
    expect(monthDrillDown("2026-02", { category: "utilities" }, scope)).toMatchObject({ category: "utilities", startDate: "2026-02-01", endDate: "2026-02-28" });
    expect(propertyMonthDrillDown("p1", "Elm St", "2026-02", "expenses")).toMatchObject({ propertyId: "p1", type: "expenses", startDate: "2026-02-01", endDate: "2026-02-28" });
  });
});

describe("moneyAnalysisDisplay", () => {
  it("splits categories into income, expenses and other, each biggest first, leaving out zeros", () => {
    const groups = categoryGroups({ rental_revenue: 900, cleaning_fee_revenue: 100, maintenance: 50, utilities: 300, taxes: 0, mystery: 7 });
    expect(groups.map((group) => [group.heading, group.rows.map((row) => row.category)])).toEqual([
      [MESSAGES.income, ["rental_revenue", "cleaning_fee_revenue"]],
      [MESSAGES.expenses, ["utilities", "maintenance"]],
      [MESSAGES.other, ["mystery"]],
    ]);
  });

  it("lists a month's expense categories and nothing for a month without a row", () => {
    expect(monthExpenseRows({ month: "2026-02", maintenance: 10, utilities: 40, taxes: 0 }).map((row) => row.category)).toEqual(["utilities", "maintenance"]);
    expect(monthExpenseRows(undefined)).toEqual([]);
  });

  it("puts the latest month first", () => {
    expect(monthsNewestFirst([{ month: "2026-01", revenue: 0, expenses: 0, profit: 0 }, { month: "2026-03", revenue: 0, expenses: 0, profit: 0 }]).map((month) => month.month)).toEqual(["2026-03", "2026-01"]);
  });

  it("knows an empty summary from one with a single figure", () => {
    const empty: SummaryResponse = { revenue: 0, expenses: 0, profit: 0, by_category: {}, by_property: [], by_month: [], by_month_expense: [], by_property_month: [] };
    expect(isEmptySummary(empty)).toBe(true);
    expect(isEmptySummary({ ...empty, by_category: { maintenance: 1 } })).toBe(false);
  });

  it("says what the category picker holds", () => {
    expect(categoriesValue(new Set(["maintenance"]))).toBe(MESSAGES.nCategories(1, 25));
  });
});
