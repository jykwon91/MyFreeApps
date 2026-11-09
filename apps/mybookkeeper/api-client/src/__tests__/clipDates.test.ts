import { describe, expect, it } from "vitest";
import { clipDates } from "../utils/clipDates";

const MARCH = { startDate: "2026-03-01", endDate: "2026-03-31" };

describe("clipDates", () => {
  it("stops a month at the end of the range", () => {
    expect(clipDates(MARCH, { startDate: "2026-01-01", endDate: "2026-03-09" })).toEqual({ startDate: "2026-03-01", endDate: "2026-03-09" });
  });

  it("starts a month where the range starts", () => {
    expect(clipDates(MARCH, { startDate: "2026-03-15", endDate: "2026-12-31" })).toEqual({ startDate: "2026-03-15", endDate: "2026-03-31" });
  });

  it("leaves a month that is inside the range whole", () => {
    expect(clipDates(MARCH, { startDate: "2026-01-01", endDate: "2026-12-31" })).toEqual(MARCH);
  });

  it("leaves a side alone when the range has no date there", () => {
    expect(clipDates(MARCH, {})).toEqual(MARCH);
  });
});
