import { describe, expect, it } from "vitest";
import { formatShortDate } from "../utils/formatShortDate";

describe("formatShortDate", () => {
  it("gives the day, short month and year in the reader's locale", () => {
    const iso = "2026-10-20T12:00:00Z";
    expect(formatShortDate(iso)).toBe(new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }));
    expect(formatShortDate(iso)).toMatch(/2026/);
  });
});
