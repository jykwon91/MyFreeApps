import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverySourceLabel } from "../utils/discoverySourceLabel";
import { discoverySourceTone } from "../utils/discoverySourceTone";
import { inboxCoverageLine } from "../utils/inboxCoverageLine";
import { isSourceKind } from "../utils/isSourceKind";
import { refreshIntervalLabel } from "../utils/refreshIntervalLabel";
import { refreshIntervalShortLabel } from "../utils/refreshIntervalShortLabel";
import { savedSearchCadence } from "../utils/savedSearchCadence";
import { savedSearchName } from "../utils/savedSearchName";
import { summarizeSearchQuery } from "../utils/summarizeSearchQuery";
import { unscoredCount } from "../utils/unscoredCount";
import { discoverySource } from "./support/discoverySource";

describe("summarizeSearchQuery", () => {
  it("joins the roles", () => {
    expect(summarizeSearchQuery({ roles: ["Software Engineer", "Backend Engineer"] })).toBe("Software Engineer / Backend Engineer");
    expect(summarizeSearchQuery({ roles: ["Frontend Developer"] })).toBe("Frontend Developer");
  });

  it("falls back to a legacy query, and prefers roles over it", () => {
    expect(summarizeSearchQuery({ query: "senior backend engineer" })).toBe("senior backend engineer");
    expect(summarizeSearchQuery({ roles: ["Staff Engineer"], query: "old" })).toBe("Staff Engineer");
  });

  it("skips roles that aren't strings", () => {
    expect(summarizeSearchQuery({ roles: [null, 42, "SRE"] })).toBe("SRE");
  });

  it("says when there is no query", () => {
    expect(summarizeSearchQuery({ roles: [] })).toBe("(no query)");
    expect(summarizeSearchQuery({})).toBe("(no query)");
    expect(summarizeSearchQuery({ query: "" })).toBe("(no query)");
  });

  it("shows the board token for Greenhouse and the company for Lever", () => {
    expect(summarizeSearchQuery({ board_token: "stripe" }, "greenhouse")).toBe("Board: stripe");
    expect(summarizeSearchQuery({}, "greenhouse")).toBe("(no board token)");
    expect(summarizeSearchQuery({ company_slug: "openai" }, "lever")).toBe("Company: openai");
    expect(summarizeSearchQuery({}, "lever")).toBe("(no company slug)");
    expect(summarizeSearchQuery({ roles: ["Backend Engineer"] }, "jsearch")).toBe("Backend Engineer");
  });
});

describe("source labels and tones", () => {
  it("names known adapters and keeps an unknown one's key", () => {
    expect(discoverySourceLabel("jsearch")).toBe("JSearch");
    expect(discoverySourceLabel("greenhouse")).toBe("Greenhouse");
    expect(discoverySourceLabel("lever")).toBe("Lever");
    expect(discoverySourceLabel("unknown_source")).toBe("unknown_source");
  });

  it("tones Greenhouse and Lever apart, and everything else neutral", () => {
    expect(discoverySourceTone("greenhouse")).toBe("success");
    expect(discoverySourceTone("lever")).toBe("info");
    expect(discoverySourceTone("jsearch")).toBe("neutral");
    expect(discoverySourceTone("other")).toBe("neutral");
  });

  it("knows which kinds the form can make", () => {
    expect(isSourceKind("lever")).toBe(true);
    expect(isSourceKind("ashby")).toBe(false);
  });

  it("names a saved search, else by its source key", () => {
    expect(savedSearchName(discoverySource({ name: "Backend roles" }))).toBe("Backend roles");
    expect(savedSearchName(discoverySource())).toBe("jsearch");
  });
});

describe("refresh intervals", () => {
  it("names the presets", () => {
    expect(refreshIntervalLabel(720)).toBe("Twice daily");
    expect(refreshIntervalShortLabel(120)).toBe("Every 2h");
  });

  it("describes intervals that aren't presets", () => {
    expect(refreshIntervalShortLabel(30)).toBe("Every 30m");
    expect(refreshIntervalShortLabel(180)).toBe("Every 3h");
    expect(refreshIntervalShortLabel(2880)).toBe("Every 2d");
    expect(refreshIntervalLabel(30)).toBe("Every 30m");
  });
});

describe("savedSearchCadence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-11T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("says when it last fetched", () => {
    expect(savedSearchCadence(discoverySource({ last_fetched_at: "2026-11-11T10:00:00Z" }))).toBe("Refreshes daily — last fetched 2 hours ago");
  });

  it("says it never fetched", () => {
    expect(savedSearchCadence(discoverySource({ fetch_interval_minutes: 120 }))).toBe("Refreshes every 2h — never fetched yet");
  });
});

describe("inbox coverage", () => {
  it("counts what is scored and explains the rest", () => {
    expect(inboxCoverageLine(12, 80)).toBe("Scored 12 of 80 — the rest await the next daily scoring pass");
    expect(inboxCoverageLine(5, 5)).toBe("Scored 5 of 5");
  });

  it("says nothing without counts or postings", () => {
    expect(inboxCoverageLine(null, 10)).toBeNull();
    expect(inboxCoverageLine(0, 0)).toBeNull();
  });

  it("counts the unscored", () => {
    expect(unscoredCount(3, 10)).toBe(7);
    expect(unscoredCount(null, 10)).toBeNull();
  });
});
