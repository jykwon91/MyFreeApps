import { describe, expect, it } from "vitest";
import { reconciliationDiscrepanciesMode, reconciliationSourcesMode } from "../utils/reconciliationModes";

describe("reconciliationSourcesMode", () => {
  it("returns loading when isLoading is true", () => {
    expect(reconciliationSourcesMode(true, 0)).toBe("loading");
  });

  it("returns empty when there are no sources and it is not loading", () => {
    expect(reconciliationSourcesMode(false, 0)).toBe("empty");
  });

  it("returns list when there are sources", () => {
    expect(reconciliationSourcesMode(false, 1)).toBe("list");
  });

  it("returns loading even when there are sources (loading takes priority)", () => {
    expect(reconciliationSourcesMode(true, 1)).toBe("loading");
  });
});

describe("reconciliationDiscrepanciesMode", () => {
  it("returns loading when isLoading is true", () => {
    expect(reconciliationDiscrepanciesMode(true, 0)).toBe("loading");
  });

  it("returns empty when count is 0 and not loading", () => {
    expect(reconciliationDiscrepanciesMode(false, 0)).toBe("empty");
  });

  it("returns list when count is positive", () => {
    expect(reconciliationDiscrepanciesMode(false, 3)).toBe("list");
  });

  it("returns loading even when count is positive (loading takes priority)", () => {
    expect(reconciliationDiscrepanciesMode(true, 5)).toBe("loading");
  });
});
