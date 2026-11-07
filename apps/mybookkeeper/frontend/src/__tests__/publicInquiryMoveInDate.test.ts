import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INITIAL_FORM,
  latestMoveInISO,
  validateForm,
} from "@/app/features/public-inquiry/public-inquiry-helpers";

describe("public inquiry move-in date on a US evening", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    // 9:30pm in Chicago is already the next day in UTC.
    process.env.TZ = "America/Chicago";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-07T03:30:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTz;
  });

  it("accepts the applicant's own today", () => {
    const errors = validateForm({ ...INITIAL_FORM, moveInDate: "2026-11-06" });
    expect(errors.moveInDate).toBeUndefined();
  });

  it("rejects their yesterday as in the past", () => {
    const errors = validateForm({ ...INITIAL_FORM, moveInDate: "2026-11-05" });
    expect(errors.moveInDate).toMatch(/past/);
  });

  it("runs the one-year limit from their today", () => {
    expect(latestMoveInISO()).toBe("2027-11-06");
    expect(validateForm({ ...INITIAL_FORM, moveInDate: "2027-11-06" }).moveInDate).toBeUndefined();
    expect(validateForm({ ...INITIAL_FORM, moveInDate: "2027-11-07" }).moveInDate).toMatch(/next year/);
  });
});
