import { describe, expect, it } from "vitest";
import type { MortgageRateWatch } from "../types/mortgage/mortgage-rate-watch";
import { mortgageScopeSummary, mortgageSurveyLine } from "../utils/mortgageRateWatchSummary";

const FEED: MortgageRateWatch = {
  outlooks: [],
  survey_30_year_pct: "6.58",
  survey_15_year_pct: "5.89",
  survey_observed_on: "2026-08-13",
  checked_mortgage_count: 1,
  feed_unavailable_reason: null,
};

describe("mortgageScopeSummary", () => {
  it("says so when every loan was compared", () => {
    expect(mortgageScopeSummary(1, 1)).toBe("Compared your loan against this week's averages.");
    expect(mortgageScopeSummary(3, 3)).toBe("Compared all 3 of your loans against this week's averages.");
  });

  it("says how many were left out, and where to find why", () => {
    expect(mortgageScopeSummary(3, 2)).toContain("The other one says below why it couldn't be.");
    expect(mortgageScopeSummary(4, 2)).toContain("The other 2 say below why they couldn't be.");
  });
});

describe("mortgageSurveyLine", () => {
  it("names the survey date and both averages", () => {
    const line = mortgageSurveyLine(FEED);
    expect(line).toContain("weekly survey for Aug 13, 2026: 6.58% on a 30-year fixed, 5.89% on a 15-year.");
    expect(line).toContain("None of this is a quote");
  });

  it("gives nothing when the feed had no survey date", () => {
    expect(mortgageSurveyLine({ ...FEED, survey_observed_on: null })).toBeNull();
  });
});
