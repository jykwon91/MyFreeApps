import { describe, expect, it } from "vitest";
import { activePropertyPnlPreset, isValidPropertyPnlRange, propertyPnlRange } from "../utils/propertyPnlRange";

const PRESETS = ["this_month", "this_quarter", "ytd"] as const;
const today = new Date(2026, 4, 17);

describe("propertyPnlRange", () => {
  it("runs from the start of the month to today", () => {
    expect(propertyPnlRange("this_month", today)).toEqual({ since: "2026-05-01", until: "2026-05-17" });
  });

  it("starts the quarter on its first month", () => {
    expect(propertyPnlRange("this_quarter", today)).toEqual({ since: "2026-04-01", until: "2026-05-17" });
    expect(propertyPnlRange("this_quarter", new Date(2026, 0, 1))).toEqual({ since: "2026-01-01", until: "2026-01-01" });
    expect(propertyPnlRange("this_quarter", new Date(2026, 11, 31))).toEqual({ since: "2026-10-01", until: "2026-12-31" });
  });

  it("starts the year on January 1", () => {
    expect(propertyPnlRange("ytd", today)).toEqual({ since: "2026-01-01", until: "2026-05-17" });
  });

  it("keeps the person's own day instead of the UTC one", () => {
    const lateEvening = new Date(2026, 4, 17, 23, 30);
    expect(propertyPnlRange("this_month", lateEvening).until).toBe("2026-05-17");
  });
});

describe("activePropertyPnlPreset", () => {
  it("finds the preset a range starts at", () => {
    expect(activePropertyPnlPreset(propertyPnlRange("this_quarter", today), PRESETS, today)).toBe("this_quarter");
    expect(activePropertyPnlPreset(propertyPnlRange("ytd", today), PRESETS, today)).toBe("ytd");
  });

  it("needs the end day to match too, so a month-to-date look-alike that stopped early is custom", () => {
    expect(activePropertyPnlPreset({ since: "2026-05-01", until: "2026-05-10" }, PRESETS, today)).toBeNull();
  });

  it("finds none for a range picked by hand", () => {
    expect(activePropertyPnlPreset({ since: "2026-02-10", until: "2026-03-01" }, PRESETS, today)).toBeNull();
  });
});

describe("isValidPropertyPnlRange", () => {
  it("needs both days, in order", () => {
    expect(isValidPropertyPnlRange({ since: "2026-01-01", until: "2026-01-01" })).toBe(true);
    expect(isValidPropertyPnlRange({ since: "2026-02-01", until: "2026-01-01" })).toBe(false);
    expect(isValidPropertyPnlRange({ since: "", until: "2026-01-01" })).toBe(false);
  });
});
