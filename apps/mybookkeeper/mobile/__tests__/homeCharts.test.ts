import { chartMonths, topExpenseCategories } from "../src/features/home/homeCharts";
import { alertsFailedMessage, axisMoney, monthlyChartSummary, periodHasMonths, renewalAlertLabel } from "../src/features/home/homeDisplay";
import { renewalsDue } from "../test-support/homeAlerts";

const aMonth = (month: string, revenue = 1, expenses = 0) => ({ month, revenue, expenses, profit: revenue - expenses });

describe("chartMonths", () => {
  it("has nothing to show for fewer than two months", () => {
    expect(chartMonths([])).toEqual([]);
    expect(chartMonths([aMonth("2026-03")])).toEqual([]);
  });

  it("keeps the last six months, oldest first, whatever order they come in", () => {
    const year = ["2026-12", "2026-01", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"].map((month) => aMonth(month));
    expect(chartMonths(year).map((month) => month.month)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]);
  });

  it("puts quiet months back as zero, without reaching before the first one", () => {
    expect(chartMonths([aMonth("2026-01", 5), aMonth("2026-03", 7)])).toEqual([
      aMonth("2026-01", 5),
      { month: "2026-02", revenue: 0, expenses: 0, profit: 0 },
      aMonth("2026-03", 7),
    ]);
  });

  it("counts across a new year", () => {
    expect(chartMonths([aMonth("2025-11"), aMonth("2026-02")]).map((month) => month.month)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("topExpenseCategories", () => {
  it("keeps the five biggest expenses, leaving out income and refunds that net below zero", () => {
    expect(
      topExpenseCategories({
        rental_revenue: 9000,
        uncategorized: 5000,
        utilities: 10,
        maintenance: 60,
        insurance: 50,
        taxes: 40,
        travel: 30,
        supplies: 20,
        meals: -15,
      }),
    ).toEqual([
      { category: "maintenance", amount: 60 },
      { category: "insurance", amount: 50 },
      { category: "taxes", amount: 40 },
      { category: "travel", amount: 30 },
      { category: "supplies", amount: 20 },
    ]);
  });
});

describe("home wording", () => {
  it("shortens the chart's side axis", () => {
    expect([axisMoney(0), axisMoney(950), axisMoney(1000), axisMoney(12_400)]).toEqual(["$0", "$950", "$1k", "$12k"]);
  });

  it("names the chart's span", () => {
    expect(monthlyChartSummary([aMonth("2025-12"), aMonth("2026-01")])).toBe(
      "Revenue and expenses by month, December 2025 to January 2026. Approved transactions only.",
    );
  });

  it("only makes room for a chart in periods longer than a month", () => {
    expect(periodHasMonths("thisMonth")).toBe(false);
    expect(periodHasMonths("thisYear")).toBe(true);
  });

  it("words renewals by what's happening to them", () => {
    expect(renewalAlertLabel(renewalsDue(2, 0))).toBe("2 utility plans have lapsed");
    expect(renewalAlertLabel(renewalsDue(0, 1))).toBe("1 utility plan ends within 45 days");
    expect(renewalAlertLabel(renewalsDue(1, 1))).toBe("2 utility plans need renewing");
  });

  it("says which check failed, or that several did", () => {
    const none = { renewals: false, utilityRates: false, insurancePremiums: false };
    expect(alertsFailedMessage(none)).toBeNull();
    expect(alertsFailedMessage({ ...none, renewals: true })).toBe("I couldn't check your utility plan renewals.");
    expect(alertsFailedMessage({ ...none, insurancePremiums: true })).toBe("I couldn't compare your insurance premiums to the market.");
    expect(alertsFailedMessage({ ...none, renewals: true, utilityRates: true })).toBe("I couldn't check your utility plans and insurance.");
  });
});
