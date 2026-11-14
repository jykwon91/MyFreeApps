import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatVendorLastUsed } from "../utils/formatVendorLastUsed";

describe("formatVendorLastUsed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("says how long ago the vendor was used", () => {
    expect(formatVendorLastUsed("2026-06-07T12:00:00Z")).toBe("3 days ago");
  });

  it("says never used when there is no time", () => {
    expect(formatVendorLastUsed(null)).toBe("Never used");
  });
});
