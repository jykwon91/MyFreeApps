import { describe, expect, it } from "vitest";
import { formatDesiredDates, formatLongDate, formatShortDate } from "../utils/inquiryDateFormat";

describe("inquiry dates", () => {
  it("describes a stay with no dates, one date and both dates", () => {
    expect(formatDesiredDates(null, null)).toBe("Open-ended");
    expect(formatDesiredDates("2026-06-01", null)).toBe("From Jun 1");
    expect(formatDesiredDates(null, "2026-08-31")).toBe("Until Aug 31");
    expect(formatDesiredDates("2026-06-01", "2026-08-31")).toBe("Jun 1 → Aug 31");
  });

  it("does not move a date by the device's time zone", () => {
    expect(formatShortDate("2026-06-01")).toBe("Jun 1");
    expect(formatLongDate("2026-01-01")).toBe("January 1, 2026");
  });
});
