import { dateFromIso, isoFromDate } from "../src/lib/localDate";

describe("localDate", () => {
  it("keeps the same day both ways", () => {
    const date = dateFromIso("2027-01-05");
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2027, 0, 5]);
    expect(isoFromDate(date)).toBe("2027-01-05");
  });

  it("uses the phone's day late in the evening", () => {
    expect(isoFromDate(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });
});
