import { describe, expect, it } from "vitest";
import { discoveredJobsFilter } from "../utils/discoveredJobsFilter";

describe("discoveredJobsFilter", () => {
  it("shows every saved search's postings when none is chosen", () => {
    expect(discoveredJobsFilter("saved", null)).toEqual({ state: "saved" });
    expect(discoveredJobsFilter("inbox", "")).toEqual({ state: "inbox" });
  });

  it("narrows to the chosen saved search", () => {
    expect(discoveredJobsFilter("saved", "src-1")).toEqual({ state: "saved", source_id: "src-1" });
  });
});
