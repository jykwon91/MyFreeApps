import { describe, it, expect } from "vitest";
import { summarizeSearchQuery } from "../saved-search-summary";

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
});
