import { describe, it, expect } from "vitest";
import {
  summarizeSearchQuery,
  getSourceLabel,
  getSourceBadgeColor,
} from "../saved-search-summary";

describe("summarizeSearchQuery", () => {
  it("renders roles from new-style config (roles array)", () => {
    expect(
      summarizeSearchQuery({ roles: ["Software Engineer", "Backend Engineer"] }),
    ).toBe("Software Engineer / Backend Engineer");
  });

  it("renders a single role without a slash", () => {
    expect(summarizeSearchQuery({ roles: ["Frontend Developer"] })).toBe(
      "Frontend Developer",
    );
  });

  it("falls back to legacy query string when roles is absent", () => {
    expect(
      summarizeSearchQuery({ query: "senior backend engineer python remote" }),
    ).toBe("senior backend engineer python remote");
  });

  it("prefers roles over query when both are present", () => {
    expect(
      summarizeSearchQuery({
        roles: ["Staff Engineer"],
        query: "old query string",
      }),
    ).toBe("Staff Engineer");
  });

  it("ignores non-string entries in the roles array", () => {
    expect(summarizeSearchQuery({ roles: [null, 42, "SRE"] })).toBe("SRE");
  });

  it("returns (no query) for empty roles array and absent query", () => {
    expect(summarizeSearchQuery({ roles: [] })).toBe("(no query)");
  });

  it("returns (no query) for empty config", () => {
    expect(summarizeSearchQuery({})).toBe("(no query)");
  });

  it("returns (no query) when query is an empty string", () => {
    expect(summarizeSearchQuery({ query: "" })).toBe("(no query)");
  });

  // Greenhouse + Lever source-aware summaries
  it("shows board_token for greenhouse source", () => {
    expect(
      summarizeSearchQuery({ board_token: "stripe" }, "greenhouse"),
    ).toBe("Board: stripe");
  });

  it("returns (no board token) for greenhouse with missing token", () => {
    expect(summarizeSearchQuery({}, "greenhouse")).toBe("(no board token)");
  });

  it("shows company_slug for lever source", () => {
    expect(
      summarizeSearchQuery({ company_slug: "openai" }, "lever"),
    ).toBe("Company: openai");
  });

  it("returns (no company slug) for lever with missing slug", () => {
    expect(summarizeSearchQuery({}, "lever")).toBe("(no company slug)");
  });

  it("falls back to role-based summary for jsearch even when source is passed", () => {
    expect(
      summarizeSearchQuery({ roles: ["Backend Engineer"] }, "jsearch"),
    ).toBe("Backend Engineer");
  });
});

describe("getSourceLabel", () => {
  it("returns human-readable label for known sources", () => {
    expect(getSourceLabel("jsearch")).toBe("JSearch");
    expect(getSourceLabel("greenhouse")).toBe("Greenhouse");
    expect(getSourceLabel("lever")).toBe("Lever");
  });

  it("returns the raw source string for unknown sources", () => {
    expect(getSourceLabel("unknown_source")).toBe("unknown_source");
  });
});

describe("getSourceBadgeColor", () => {
  it("returns green for greenhouse", () => {
    expect(getSourceBadgeColor("greenhouse")).toBe("green");
  });

  it("returns blue for lever", () => {
    expect(getSourceBadgeColor("lever")).toBe("blue");
  });

  it("returns gray for jsearch", () => {
    expect(getSourceBadgeColor("jsearch")).toBe("gray");
  });

  it("returns gray for unknown sources", () => {
    expect(getSourceBadgeColor("other")).toBe("gray");
  });
});
