import { describe, expect, it } from "vitest";
import { formatMonthLong, formatMonthShort, isMonthText, monthOf, shiftMonth } from "../utils/monthText";

describe("monthText", () => {
  it("names the month a local day falls in", () => {
    expect(monthOf(new Date(2026, 10, 30, 23, 59))).toBe("2026-11");
    expect(monthOf(new Date(2027, 0, 1, 0, 0))).toBe("2027-01");
  });

  it("accepts only a real YYYY-MM", () => {
    expect(isMonthText("2026-11")).toBe(true);
    expect(isMonthText("2026-13")).toBe(false);
    expect(isMonthText("2026-00")).toBe(false);
    expect(isMonthText("2026-1")).toBe(false);
    expect(isMonthText("2026-11-01")).toBe(false);
    expect(isMonthText(null)).toBe(false);
  });

  it("moves across a year end both ways", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftMonth("2026-03", -12)).toBe("2025-03");
  });

  it("labels months long and short", () => {
    expect(formatMonthLong("2026-11")).toBe("November 2026");
    expect(formatMonthShort("2026-11")).toBe("Nov 26");
  });
});
