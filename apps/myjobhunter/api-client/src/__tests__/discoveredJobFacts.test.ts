import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoveredJobFacts } from "../utils/discoveredJobFacts";
import { discoveredJob } from "./support/discoveredJob";
import { discoverySource } from "./support/discoverySource";

describe("discoveredJobFacts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-11T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("shows nothing optional for a bare unscored posting", () => {
    expect(discoveredJobFacts(discoveredJob(), null, [])).toEqual({
      remoteLabel: null,
      salaryLabel: null,
      postedLabel: null,
      verdictLabel: null,
      verdictTone: "info",
      isUnscored: true,
      isScoreStale: false,
      isSaved: false,
      isPromoted: false,
      sourceName: null,
    });
  });

  it("describes a scored, saved, promoted posting", () => {
    const job = discoveredJob({
      remote_type: "onsite",
      salary_min: 120000,
      salary_max: 150000,
      salary_period: "year",
      posted_at: "2026-11-09T12:00:00Z",
      verdict: "strong_fit",
      score: 90,
      scored_at: "2026-11-10T00:00:00Z",
      saved_at: "2026-11-10T00:00:00Z",
      promoted_application_id: "a1",
      discovery_source_id: "s1",
    });
    const facts = discoveredJobFacts(job, "2026-11-01T00:00:00Z", [discoverySource({ name: "Backend roles" })]);
    expect(facts).toMatchObject({
      remoteLabel: "On-site",
      postedLabel: "2 days ago",
      verdictLabel: "Strong fit",
      isUnscored: false,
      isScoreStale: false,
      isSaved: true,
      isPromoted: true,
      sourceName: "Backend roles",
    });
    expect(facts.salaryLabel).toContain("120");
  });

  it("marks a score stale once the profile changed after it", () => {
    const job = discoveredJob({ verdict: "worth_considering", score: 60, scored_at: "2026-11-01T00:00:00Z" });
    expect(discoveredJobFacts(job, "2026-11-05T00:00:00Z", []).isScoreStale).toBe(true);
  });

  it("names an unnamed saved search by its source", () => {
    expect(discoveredJobFacts(discoveredJob({ discovery_source_id: "s1" }), null, [discoverySource()]).sourceName).toBe("jsearch");
  });
});
