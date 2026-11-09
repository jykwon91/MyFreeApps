import { addMonths, dateFromIso, isoFromDate, monthBounds, monthName } from "../src/lib/localDate";

describe("localDate", () => {
  it("keeps the same day both ways", () => {
    const date = dateFromIso("2027-01-05");
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2027, 0, 5]);
    expect(isoFromDate(date)).toBe("2027-01-05");
  });

  it("uses the phone's day late in the evening", () => {
    expect(isoFromDate(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });

  it("gives a month's first and last day, including a leap February", () => {
    expect(monthBounds("2028-02")).toEqual({ start_date: "2028-02-01", end_date: "2028-02-29" });
    expect(monthBounds("2026-12")).toEqual({ start_date: "2026-12-01", end_date: "2026-12-31" });
  });

  it("moves a month across years both ways", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2025-12", 2)).toBe("2026-02");
  });

  it("names a month short for a chart and long for a sentence", () => {
    expect(monthName("2026-03", "short")).toBe("Mar");
    expect(monthName("2026-03", "long")).toBe("March 2026");
  });
});
