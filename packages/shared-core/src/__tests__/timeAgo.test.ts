import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { timeAgo } from "../utils/timeAgo";

describe("timeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-11T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("says how long ago a past time was", () => {
    expect(timeAgo("2026-11-11T10:00:00Z")).toBe("2 hours ago");
    expect(timeAgo("2026-11-08T12:00:00Z")).toBe("3 days ago");
  });

  it("says how far off a time still to come is", () => {
    expect(timeAgo("2026-11-14T12:00:00Z")).toBe("in 3 days");
  });
});
