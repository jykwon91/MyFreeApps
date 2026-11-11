import { describe, expect, it } from "vitest";
import { EMPTY_JSEARCH_FORM_VALUES } from "../constants/emptyJSearchFormValues";
import type { JSearchFormValues } from "../types/discovery/jsearch-form-values";
import type { SavedSearchFormValues } from "../types/discovery/saved-search-form-values";
import { buildSavedSearchSummary } from "../utils/buildSavedSearchSummary";
import { isSameJson } from "../utils/isSameJson";
import { isTypedBoardTokenInvalid } from "../utils/isTypedBoardTokenInvalid";
import { isTypedCompanySlugInvalid } from "../utils/isTypedCompanySlugInvalid";
import { jsearchConfig } from "../utils/jsearchConfig";
import { savedSearchCreateRequest } from "../utils/savedSearchCreateRequest";
import { savedSearchFormValues } from "../utils/savedSearchFormValues";
import { savedSearchPatch } from "../utils/savedSearchPatch";
import { savedSearchEditProblem } from "../utils/savedSearchEditProblem";
import { savedSearchProblem } from "../utils/savedSearchProblem";
import { discoverySource } from "./support/discoverySource";

function jsearch(overrides: Partial<JSearchFormValues> = {}): JSearchFormValues {
  return { ...EMPTY_JSEARCH_FORM_VALUES, roles: ["Backend Engineer"], ...overrides };
}

function form(overrides: Partial<SavedSearchFormValues> = {}): SavedSearchFormValues {
  return {
    source: "jsearch",
    name: "",
    fetchIntervalMinutes: 1440,
    jsearch: jsearch(),
    boardToken: "",
    greenhouseExcludedKeywords: [],
    companySlug: "",
    leverExcludedKeywords: [],
    ...overrides,
  };
}

describe("jsearchConfig", () => {
  it("leaves out optional filters left empty", () => {
    expect(jsearchConfig(jsearch({ employmentType: "" }))).toEqual({
      roles: ["Backend Engineer"],
      skills: [],
      country: "us",
      date_posted: "week",
      remote_jobs_only: false,
    });
  });

  it("sends every filter that is set, with the salary in whole dollars", () => {
    expect(
      jsearchConfig(
        jsearch({
          location: " Austin ",
          experience: "no_experience",
          minSalary: "120000.7",
          excludedIndustryChips: ["defense"],
          excludedKeywords: ["clearance"],
        }),
      ),
    ).toMatchObject({
      location: "Austin",
      employment_type: "FULLTIME",
      experience: "no_experience",
      min_salary_usd: 120000,
      excluded_industry_chips: ["defense"],
      excluded_keywords: ["clearance"],
    });
  });

  it("ignores a salary that isn't above zero", () => {
    expect(jsearchConfig(jsearch({ minSalary: "0" }))).not.toHaveProperty("min_salary_usd");
    expect(jsearchConfig(jsearch({ minSalary: "abc" }))).not.toHaveProperty("min_salary_usd");
  });
});

describe("savedSearchProblem", () => {
  it("needs a role for JSearch", () => {
    expect(savedSearchProblem(form({ jsearch: jsearch({ roles: [] }) }))).toBe("Add at least one role title");
    expect(savedSearchProblem(form())).toBeNull();
  });

  it("checks the Greenhouse board token", () => {
    expect(savedSearchProblem(form({ source: "greenhouse" }))).toBe("Enter a Greenhouse board token");
    expect(savedSearchProblem(form({ source: "greenhouse", boardToken: "bad token" }))).toMatch(/^Invalid board token/);
    expect(savedSearchProblem(form({ source: "greenhouse", boardToken: " stripe " }))).toBeNull();
  });

  it("checks the Lever slug, whatever its case", () => {
    expect(savedSearchProblem(form({ source: "lever" }))).toBe("Enter a Lever company slug");
    expect(savedSearchProblem(form({ source: "lever", companySlug: "open_ai" }))).toMatch(/^Invalid company slug/);
    expect(savedSearchProblem(form({ source: "lever", companySlug: "OpenAI" }))).toBeNull();
  });

  it("puts a name that is too long first", () => {
    expect(savedSearchProblem(form({ name: "x".repeat(101), jsearch: jsearch({ roles: [] }) }))).toBe("Name: Keep this to 100 characters or fewer.");
  });

  it("only checks the name of a kind this build can't edit", () => {
    const ashby = discoverySource({ source: "ashby" });
    expect(savedSearchEditProblem(ashby, form({ jsearch: jsearch({ roles: [] }) }))).toBeNull();
    expect(savedSearchEditProblem(ashby, form({ name: "x".repeat(101) }))).toBe("Name: Keep this to 100 characters or fewer.");
    expect(savedSearchEditProblem(discoverySource(), form({ jsearch: jsearch({ roles: [] }) }))).toBe("Add at least one role title");
  });

  it("flags a token or slug as it is typed, but not an empty one", () => {
    expect(isTypedBoardTokenInvalid("")).toBe(false);
    expect(isTypedBoardTokenInvalid("a b")).toBe(true);
    expect(isTypedCompanySlugInvalid("OpenAI")).toBe(false);
    expect(isTypedCompanySlugInvalid("open_ai")).toBe(true);
  });
});

describe("savedSearchCreateRequest", () => {
  it("leaves a blank name out", () => {
    expect(savedSearchCreateRequest(form({ name: "  " }))).toEqual({
      source: "jsearch",
      name: undefined,
      config: jsearchConfig(jsearch()),
      fetch_interval_minutes: 1440,
    });
  });

  it("sends a Greenhouse token, and its keywords only when there are some", () => {
    expect(savedSearchCreateRequest(form({ source: "greenhouse", name: "Stripe", boardToken: " stripe " })).config).toEqual({ board_token: "stripe" });
    expect(savedSearchCreateRequest(form({ source: "greenhouse", boardToken: "stripe", greenhouseExcludedKeywords: ["intern"] })).config).toEqual({
      board_token: "stripe",
      excluded_keywords: ["intern"],
    });
  });

  it("sends a Lever slug lowercase", () => {
    expect(savedSearchCreateRequest(form({ source: "lever", companySlug: " OpenAI " })).config).toEqual({ company_slug: "openai" });
  });
});

describe("savedSearchFormValues", () => {
  it("starts an edit from a saved JSearch config", () => {
    const values = savedSearchFormValues(
      discoverySource({ name: "Mine", fetch_interval_minutes: 720, config: { roles: ["SRE"], min_salary_usd: 90000, remote_jobs_only: true } }),
      "jsearch",
    );
    expect(values.name).toBe("Mine");
    expect(values.fetchIntervalMinutes).toBe(720);
    expect(values.jsearch).toMatchObject({ roles: ["SRE"], minSalary: "90000", remoteOnly: true, country: "us", datePosted: "week" });
  });

  it("starts an edit from a Lever config", () => {
    const values = savedSearchFormValues(discoverySource({ source: "lever", config: { company_slug: "openai", excluded_keywords: ["intern"] } }), "lever");
    expect(values.companySlug).toBe("openai");
    expect(values.leverExcludedKeywords).toEqual(["intern"]);
    expect(values.jsearch).toEqual(EMPTY_JSEARCH_FORM_VALUES);
  });
});

describe("savedSearchPatch", () => {
  const saved = discoverySource({ name: "Mine", config: jsearchConfig(jsearch()) });

  it("is null when nothing changed", () => {
    expect(savedSearchPatch(saved, savedSearchFormValues(saved, "jsearch"))).toBeNull();
  });

  it("sends only the name or the frequency when only that changed", () => {
    const values = savedSearchFormValues(saved, "jsearch");
    expect(savedSearchPatch(saved, { ...values, name: " Renamed " })).toEqual({ name: "Renamed" });
    expect(savedSearchPatch(saved, { ...values, fetchIntervalMinutes: 120 })).toEqual({ fetch_interval_minutes: 120 });
  });

  it("sends a changed config whole, with its kind", () => {
    const values = savedSearchFormValues(saved, "jsearch");
    const patch = savedSearchPatch(saved, { ...values, jsearch: { ...values.jsearch, skills: ["Go"] } });
    expect(patch).toEqual({ config: { ...saved.config, skills: ["Go"] }, source_kind: "jsearch" });
  });

  it("doesn't treat an untouched Greenhouse search as changed, with or without a keyword list", () => {
    const listed = discoverySource({ source: "greenhouse", name: "Stripe", config: { board_token: "stripe", excluded_keywords: [] } });
    expect(savedSearchPatch(listed, savedSearchFormValues(listed, "greenhouse"))).toBeNull();
    const unlisted = discoverySource({ source: "greenhouse", name: "Stripe", config: { board_token: "stripe" } });
    expect(savedSearchPatch(unlisted, savedSearchFormValues(unlisted, "greenhouse"))).toBeNull();
  });

  it("sends a cleared keyword list", () => {
    const lever = discoverySource({ source: "lever", name: "OpenAI", config: { company_slug: "openai", excluded_keywords: ["intern"] } });
    const values = savedSearchFormValues(lever, "lever");
    expect(savedSearchPatch(lever, { ...values, leverExcludedKeywords: [] })).toEqual({
      config: { company_slug: "openai", excluded_keywords: [] },
      source_kind: "lever",
    });
  });

  it("keeps the config of a kind this build can't edit", () => {
    const ashby = discoverySource({ source: "ashby", name: "A", config: { org: "x" } });
    const values = savedSearchFormValues(ashby, "jsearch");
    expect(savedSearchPatch(ashby, values)).toBeNull();
    expect(savedSearchPatch(ashby, { ...values, name: "B" })).toEqual({ name: "B" });
  });
});

describe("isSameJson", () => {
  it("ignores key order and compares deeply", () => {
    expect(isSameJson({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(isSameJson({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(isSameJson([1, 2], [2, 1])).toBe(false);
    expect(isSameJson(null, {})).toBe(false);
  });
});

describe("buildSavedSearchSummary", () => {
  it("asks for a role first", () => {
    expect(buildSavedSearchSummary(jsearch({ roles: [] }))).toBe("Add at least one role to preview the search.");
  });

  it("reads back the search with its values in bold", () => {
    expect(buildSavedSearchSummary(jsearch({ skills: ["Go"], location: "Austin", minSalary: "150000", experience: "no_experience" }))).toBe(
      "This will search for **Backend Engineer** roles matching **Go** in **Austin** posted in **the past week** in **the US** (full-time) requiring entry-level paying **$150,000**+.",
    );
  });

  it("lists what it excludes, a few keywords at a time", () => {
    expect(buildSavedSearchSummary(jsearch({ remoteOnly: true, location: "Austin", excludedKeywords: ["a", "b", "c", "d"] }))).toContain(
      '**remote-only** posted in',
    );
    expect(buildSavedSearchSummary(jsearch({ excludedKeywords: ["a", "b", "c", "d"] }))).toMatch(/Excluding "a", "b", "c" \+1 more\.$/);
  });
});
