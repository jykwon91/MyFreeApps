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

  it("says just now within a minute either way", () => {
    expect(timeAgo("2026-11-11T12:00:00Z")).toBe("just now");
    expect(timeAgo("2026-11-11T11:59:01Z")).toBe("just now");
    expect(timeAgo("2026-11-11T12:00:30Z")).toBe("just now");
  });

  it("counts from one minute", () => {
    expect(timeAgo("2026-11-11T11:59:00Z")).toBe("1 minute ago");
  });
});
