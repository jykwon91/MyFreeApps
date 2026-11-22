import { describe, expect, it } from "vitest";
import { COMPANY_RESEARCH_READY_MESSAGE } from "../constants/companyResearchMessages";
import type { CompanyResearch } from "../types/company-research";
import type { ResearchRunFailureReason } from "../types/company/research-run-failure-reason";
import { canRetryResearch } from "../utils/canRetryResearch";
import { researchFirstLoading } from "../utils/researchFirstLoading";
import { researchLoadFailed } from "../utils/researchLoadFailed";

const SOME_RESEARCH = { id: "r1" } as CompanyResearch;

describe("canRetryResearch", () => {
  it.each<[ResearchRunFailureReason, boolean]>([
    ["not-configured", false],
    ["company-gone", false],
    ["rate-limited", true],
    ["already-running", true],
    ["retryable", true],
  ])("%s -> %s", (reason, expected) => {
    expect(canRetryResearch(reason)).toBe(expected);
  });
});

describe("researchLoadFailed", () => {
  it("is a failed load when the panel failed without a failed run", () => {
    expect(researchLoadFailed("failed", false)).toBe(true);
  });

  it("is a failed run when the run errored", () => {
    expect(researchLoadFailed("failed", true)).toBe(false);
  });

  it("is not a failure in any other mode", () => {
    expect(researchLoadFailed("ready", false)).toBe(false);
    expect(researchLoadFailed("no-research", false)).toBe(false);
    expect(researchLoadFailed("loading", false)).toBe(false);
  });
});

describe("researchFirstLoading", () => {
  it("is true while the first answer is pending", () => {
    expect(researchFirstLoading("no-research", undefined, true)).toBe(true);
  });

  it("is false once answered, or when research is already shown", () => {
    expect(researchFirstLoading("no-research", undefined, false)).toBe(false);
    expect(researchFirstLoading("no-research", SOME_RESEARCH, true)).toBe(false);
    expect(researchFirstLoading("ready", SOME_RESEARCH, true)).toBe(false);
  });
});

describe("COMPANY_RESEARCH_READY_MESSAGE", () => {
  it("is the line both apps toast", () => {
    expect(COMPANY_RESEARCH_READY_MESSAGE).toBe("The research is ready.");
  });
});
