import { describe, expect, it } from "vitest";
import type { DiscoveredDetail } from "../types/recipe/discovery";
import { discoveredRecipeDraft } from "../utils/discoveredRecipeDraft";
import { discoveryReadErrorMessage } from "../utils/discoveryReadErrorMessage";
import { discoverySearchErrorMessage } from "../utils/discoverySearchErrorMessage";
import { formatTotalMinutes } from "../utils/formatTotalMinutes";
import { hostLabel } from "../utils/hostLabel";

const DETAIL: DiscoveredDetail = {
  title: "Flan",
  source_type: "website",
  site_name: "Serious Eats",
  url: "https://www.seriouseats.com/flan",
  image_url: null,
  summary: "",
  draft: {
    title: "Flan",
    description: null,
    source: "Serious Eats",
    servings: null,
    prep_minutes: null,
    cook_minutes: null,
    ingredients: [],
    steps: [],
  },
  tips: [],
  community_notes: [],
  sources: [],
};

describe("formatTotalMinutes", () => {
  it("reads as a cook says it, and is empty for no time", () => {
    expect(formatTotalMinutes(45)).toBe("45 min");
    expect(formatTotalMinutes(60)).toBe("1 hr");
    expect(formatTotalMinutes(90)).toBe("1 hr 30 min");
    expect(formatTotalMinutes(0)).toBeNull();
    expect(formatTotalMinutes(null)).toBeNull();
  });
});

describe("hostLabel", () => {
  it("names the site without www, port, path or credentials", () => {
    expect(hostLabel("https://www.SeriousEats.com/flan?x=1")).toBe("seriouseats.com");
    expect(hostLabel("http://user:pw@blog.example:8080/a")).toBe("blog.example");
    expect(hostLabel("https://reddit.com")).toBe("reddit.com");
  });

  it("is empty for something that isn't a URL", () => {
    expect(hostLabel("not a url")).toBe("");
    expect(hostLabel("")).toBe("");
  });
});

describe("discoveredRecipeDraft", () => {
  it("credits the publisher and the page when the draft named a source", () => {
    expect(discoveredRecipeDraft(DETAIL).source).toBe("Serious Eats (https://www.seriouseats.com/flan)");
    expect(discoveredRecipeDraft({ ...DETAIL, site_name: null }).source).toBe(DETAIL.url);
  });

  it("records the page when the draft named none", () => {
    expect(discoveredRecipeDraft({ ...DETAIL, draft: { ...DETAIL.draft, source: null } }).source).toBe(DETAIL.url);
  });
});

describe("discovery error messages", () => {
  it("says why a search failed, by status", () => {
    expect(discoverySearchErrorMessage({ status: 422 })).toMatch(/couldn't find recipes/);
    expect(discoverySearchErrorMessage({ status: 429 })).toMatch(/a lot of searches/);
    expect(discoverySearchErrorMessage({ status: 503 })).toMatch(/isn't available/);
    expect(discoverySearchErrorMessage({ status: undefined, data: "Network Error" })).toMatch(/Something went wrong/);
    expect(discoverySearchErrorMessage(null)).toMatch(/Something went wrong/);
  });

  it("says why a read failed, by status", () => {
    expect(discoveryReadErrorMessage({ status: 422 })).toMatch(/Open the original/);
    expect(discoveryReadErrorMessage({ status: 400 })).toMatch(/can't be opened/);
    expect(discoveryReadErrorMessage({ status: 429 })).toMatch(/a lot of recipes/);
    expect(discoveryReadErrorMessage({ status: 500 })).toMatch(/try another result/);
  });
});
