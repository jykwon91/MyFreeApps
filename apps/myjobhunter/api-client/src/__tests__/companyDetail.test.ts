import { describe, expect, it } from "vitest";
import type { CompanyResearch } from "../types/company-research";
import type { CompanyResearchModeInput } from "../types/company/company-research-mode-input";
import type { ResearchSentiment } from "../types/research-sentiment";
import { companyDeleteState } from "../utils/companyDeleteState";
import { companyDomainUrl } from "../utils/companyDomainUrl";
import { companyResearchMode } from "../utils/companyResearchMode";
import { researchCompensationSignals } from "../utils/researchCompensationSignals";
import { researchRunFailure } from "../utils/researchRunFailure";
import { researchSourceUrl } from "../utils/researchSourceUrl";
import type { ResearchSource } from "../types/research-source";
import { companyFieldText } from "../utils/companyFieldText";
import { researchSentimentLabel, researchSentimentTone } from "../utils/researchSentiment";

function research(overrides: Partial<CompanyResearch> = {}): CompanyResearch {
  return {
    id: "r1",
    company_id: "c1",
    user_id: "u1",
    overall_sentiment: "positive",
    senior_engineer_sentiment: null,
    interview_process: null,
    description: null,
    products_for_you: null,
    red_flags: [],
    green_flags: [],
    reported_comp_range_min: null,
    reported_comp_range_max: null,
    comp_currency: "USD",
    comp_confidence: "low",
    raw_synthesis: null,
    last_researched_at: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    sources: [],
    ...overrides,
  };
}

const IDLE: CompanyResearchModeInput = {
  research: undefined,
  isQueryError: false,
  queryErrorStatus: undefined,
  isMutationLoading: false,
  isMutationError: false,
};

describe("companyResearchMode", () => {
  it("is no-research before the query answers, so the panel doesn't flicker", () => {
    expect(companyResearchMode(IDLE)).toBe("no-research");
  });

  it("is no-research when the query 404s: none has been run", () => {
    expect(companyResearchMode({ ...IDLE, isQueryError: true, queryErrorStatus: 404 })).toBe("no-research");
  });

  it("is loading while a run is in flight, even over research already shown", () => {
    expect(companyResearchMode({ ...IDLE, isMutationLoading: true })).toBe("loading");
    expect(companyResearchMode({ ...IDLE, research: research(), isMutationLoading: true })).toBe("loading");
  });

  it("is ready once research is loaded, even after a failed re-run", () => {
    expect(companyResearchMode({ ...IDLE, research: research() })).toBe("ready");
    expect(companyResearchMode({ ...IDLE, research: research(), isMutationError: true })).toBe("ready");
  });

  it("is failed on a query error other than 404, or a failed run", () => {
    expect(companyResearchMode({ ...IDLE, isQueryError: true, queryErrorStatus: 500 })).toBe("failed");
    expect(companyResearchMode({ ...IDLE, isQueryError: true })).toBe("failed");
    expect(companyResearchMode({ ...IDLE, isMutationError: true })).toBe("failed");
  });

  it("is failed when the first run fails, though the query still says none has been run", () => {
    expect(companyResearchMode({ ...IDLE, isQueryError: true, queryErrorStatus: 404, isMutationError: true })).toBe("failed");
  });
});

describe("research sentiment", () => {
  it.each<[ResearchSentiment, string, string]>([
    ["positive", "Positive", "success"],
    ["mixed", "Mixed", "warning"],
    ["negative", "Negative", "danger"],
    ["unknown", "Unknown", "neutral"],
  ])("reads %s as %s with the %s tone", (sentiment, label, tone) => {
    expect(researchSentimentLabel(research({ overall_sentiment: sentiment }))).toBe(label);
    expect(researchSentimentTone(research({ overall_sentiment: sentiment }))).toBe(tone);
  });

  it("reads a sentiment the app doesn't know yet as Unknown, including a prototype key", () => {
    for (const value of ["ecstatic", "toString"]) {
      const odd = research({ overall_sentiment: value as ResearchSentiment });
      expect(researchSentimentLabel(odd)).toBe("Unknown");
      expect(researchSentimentTone(odd)).toBe("neutral");
    }
  });
});

describe("researchCompensationSignals", () => {
  it("is the synthesis's compensation signals as text", () => {
    expect(researchCompensationSignals(research({ raw_synthesis: { compensation_signals: "Above market." } }))).toBe("Above market.");
    expect(researchCompensationSignals(research({ raw_synthesis: { compensation_signals: 42 } }))).toBe("42");
  });

  it("is null when there's no synthesis, or its signals are falsy or only spaces", () => {
    expect(researchCompensationSignals(research())).toBeNull();
    expect(researchCompensationSignals(research({ raw_synthesis: {} }))).toBeNull();
    for (const empty of [null, "", "   ", 0, false]) {
      expect(researchCompensationSignals(research({ raw_synthesis: { compensation_signals: empty } }))).toBeNull();
    }
  });
});

describe("companyDeleteState", () => {
  it("waits while the applications load, or when they couldn't", () => {
    expect(companyDeleteState({ isLoading: true, loadError: undefined, total: 0 })).toBe("waiting");
    expect(companyDeleteState({ isLoading: false, loadError: { status: 500 }, total: 0 })).toBe("waiting");
  });

  it("is blocked while the company has any applications", () => {
    expect(companyDeleteState({ isLoading: false, loadError: undefined, total: 1 })).toBe("blocked");
  });

  it("is allowed once the list has loaded empty", () => {
    expect(companyDeleteState({ isLoading: false, loadError: undefined, total: 0 })).toBe("allowed");
  });
});

describe("companyDomainUrl", () => {
  it("is the domain's https address", () => {
    expect(companyDomainUrl("acme.com")).toBe("https://acme.com");
  });
});

function source(url: string): ResearchSource {
  return { id: "s1", company_research_id: "r1", url, title: null, snippet: null, source_type: "web", fetched_at: "", created_at: "" };
}

describe("researchSourceUrl", () => {
  it("is the address when it's http or https, trimmed", () => {
    expect(researchSourceUrl(source("https://glassdoor.com/acme"))).toBe("https://glassdoor.com/acme");
    expect(researchSourceUrl(source(" HTTP://acme.com "))).toBe("HTTP://acme.com");
  });

  it("is null for any other scheme or none, so it never opens", () => {
    for (const url of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "intent://scan/#Intent;scheme=zxing;end",
      "tel:5551234",
      "sms:5551234",
      "data:text/html,hi",
      "myapp://open",
      "glassdoor.com/acme",
    ]) {
      expect(researchSourceUrl(source(url))).toBeNull();
    }
  });
});

describe("researchRunFailure", () => {
  it("says a 503 means research isn't set up, which a retry can't fix", () => {
    expect(researchRunFailure({ status: 503, data: { detail: "Tavily research is not configured: no key" } })).toEqual({
      reason: "not-configured",
      detail: "Tavily research is not configured: no key",
    });
  });

  it("says a 404 means the company is gone", () => {
    expect(researchRunFailure({ status: 404, data: { detail: "Company not found" } }).reason).toBe("company-gone");
  });

  it("offers a retry for the AI or search failing, or anything else, with the server's reason when there is one", () => {
    expect(researchRunFailure({ status: 502, data: { detail: "AI synthesis failed: overloaded" } })).toEqual({
      reason: "retryable",
      detail: "AI synthesis failed: overloaded",
    });
    expect(researchRunFailure({ status: 504, data: { detail: "  " } })).toEqual({ reason: "retryable", detail: null });
    expect(researchRunFailure({ status: 500, data: { detail: [{ msg: "x" }] } })).toEqual({ reason: "retryable", detail: null });
    expect(researchRunFailure(new Error("Network Error"))).toEqual({ reason: "retryable", detail: null });
    expect(researchRunFailure(null)).toEqual({ reason: "retryable", detail: null });
  });
});

describe("companyFieldText", () => {
  it("reads the size range as it reads the list's columns, missing when blank", () => {
    const company = { id: "c1", size_range: "51-200" } as unknown as Parameters<typeof companyFieldText>[0];
    expect(companyFieldText(company, "size_range")).toBe("51-200");
    expect(companyFieldText({ ...company, size_range: "  " }, "size_range")).toBeUndefined();
    expect(companyFieldText({ ...company, size_range: null }, "size_range")).toBeUndefined();
  });
});
