import { describe, expect, it } from "vitest";
import { ANALYZE_LONG_RUNNING_MS } from "../constants/jobAnalysis";
import { DIMENSION_STATUS_LABELS } from "../constants/jobAnalysisDimensionStatusLabels";
import { DIMENSION_STATUS_TONES } from "../constants/jobAnalysisDimensionStatusTones";
import type { JobAnalysisDimension } from "../types/job-analysis/job-analysis-dimension";
import type { JobAnalysisExtracted } from "../types/job-analysis/job-analysis-extracted";
import { formatDimensionKey } from "../utils/formatDimensionKey";
import { formatDimensionStatus } from "../utils/formatDimensionStatus";
import { jobAnalysisHeadline } from "../utils/jobAnalysisHeadline";
import { jobAnalysisSourceUrl } from "../utils/jobAnalysisSourceUrl";
import { msUntilLongRunning } from "../utils/msUntilLongRunning";
import { orderedDimensions } from "../utils/orderedDimensions";
import { toneForDimensionStatus } from "../utils/toneForDimensionStatus";
import { verdictBannerLabel } from "../utils/verdictBannerLabel";

function dimension(key: string, status = "strong"): JobAnalysisDimension {
  return { key, status, rationale: `${key} rationale` };
}

const EXTRACTED: JobAnalysisExtracted = {
  title: "  Staff Engineer ",
  company: " Stripe",
  location: " Remote ",
  remote_type: null,
  posted_salary_min: null,
  posted_salary_max: null,
  posted_salary_currency: null,
  posted_salary_period: null,
  summary: null,
};

describe("orderedDimensions", () => {
  it("puts the rubric's five in its order, whatever order they arrived in", () => {
    const shuffled = ["work_auth", "salary", "skill_match", "location_remote", "seniority"].map((key) => dimension(key));
    expect(orderedDimensions(shuffled).map(({ key }) => key)).toEqual(["skill_match", "seniority", "salary", "location_remote", "work_auth"]);
  });

  it("keeps a dimension added on the backend later, at the end", () => {
    const rows = [dimension("culture"), dimension("salary"), dimension("skill_match")];
    expect(orderedDimensions(rows).map(({ key }) => key)).toEqual(["skill_match", "salary", "culture"]);
  });

  it("is empty for no dimensions", () => {
    expect(orderedDimensions([])).toEqual([]);
  });
});

describe("dimension labels and tones", () => {
  it("names the rubric's dimensions, and shows an unknown one as sent", () => {
    expect(formatDimensionKey("location_remote")).toBe("Location & remote");
    expect(formatDimensionKey("culture")).toBe("culture");
  });

  it("labels known statuses, and shows an unknown one as sent, even one named like Object's own", () => {
    expect(formatDimensionStatus("below_target")).toBe("Below target");
    expect(formatDimensionStatus("sideways")).toBe("sideways");
    expect(formatDimensionStatus("toString")).toBe("toString");
  });

  it("gives every labelled status a tone, so a new one can't ship without", () => {
    expect(Object.keys(DIMENSION_STATUS_TONES).sort()).toEqual(Object.keys(DIMENSION_STATUS_LABELS).sort());
  });

  it("keeps the colours the website's badges have always used", () => {
    expect(toneForDimensionStatus("strong")).toBe("success");
    expect(toneForDimensionStatus("partial")).toBe("warning");
    expect(toneForDimensionStatus("blocker")).toBe("danger");
    expect(toneForDimensionStatus("above")).toBe("info");
    expect(toneForDimensionStatus("unclear")).toBe("neutral");
  });

  it("is neutral for a status it doesn't know", () => {
    expect(toneForDimensionStatus("sideways")).toBe("neutral");
    expect(toneForDimensionStatus("constructor")).toBe("neutral");
  });
});

describe("jobAnalysisHeadline", () => {
  it("trims what Claude found", () => {
    expect(jobAnalysisHeadline(EXTRACTED)).toEqual({ title: "Staff Engineer", company: "Stripe", location: "Remote" });
  });

  it("fills in a missing or blank role and company, and leaves out a missing location", () => {
    expect(jobAnalysisHeadline({ ...EXTRACTED, title: null, company: "  ", location: " " })).toEqual({
      title: "Untitled role",
      company: "Unknown company",
      location: null,
    });
  });
});

describe("jobAnalysisSourceUrl", () => {
  it("opens an http or https posting", () => {
    expect(jobAnalysisSourceUrl("https://jobs.example.com/1")).toBe("https://jobs.example.com/1");
    expect(jobAnalysisSourceUrl("HTTP://jobs.example.com/1")).toBe("HTTP://jobs.example.com/1");
  });

  it("won't open anything else, or nothing", () => {
    expect(jobAnalysisSourceUrl("javascript:alert(1)")).toBeNull();
    expect(jobAnalysisSourceUrl("intent://jobs#Intent;end")).toBeNull();
    expect(jobAnalysisSourceUrl(null)).toBeNull();
  });
});

describe("verdictBannerLabel", () => {
  it("names a known verdict, and says only Analyzed for one this build doesn't know", () => {
    expect(verdictBannerLabel("strong_fit")).toBe("Strong fit");
    expect(verdictBannerLabel("mismatch")).toBe("Mismatch");
    expect(verdictBannerLabel("surprising_fit")).toBe("Analyzed");
    expect(verdictBannerLabel("constructor")).toBe("Analyzed");
  });
});

describe("msUntilLongRunning", () => {
  it("counts down from when the analysis was sent, not from now", () => {
    expect(msUntilLongRunning(1_000, 1_000)).toBe(ANALYZE_LONG_RUNNING_MS);
    expect(msUntilLongRunning(1_000, 2_000)).toBe(ANALYZE_LONG_RUNNING_MS - 1_000);
    expect(msUntilLongRunning(1_000, 1_000 + ANALYZE_LONG_RUNNING_MS + 5)).toBe(0);
  });
});
