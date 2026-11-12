import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { timeSince } from "../utils/timeSince";

describe("timeSince", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-11T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("says just now for a time in the future (clock skew)", () => {
    expect(timeSince("2026-11-11T12:03:00Z")).toBe("just now");
  });

  it("says just now within the last minute", () => {
    expect(timeSince("2026-11-11T11:59:30Z")).toBe("just now");
    expect(timeSince("2026-11-11T12:00:00Z")).toBe("just now");
  });

  it("falls back to timeAgo from a minute on", () => {
    expect(timeSince("2026-11-11T11:59:00Z")).toBe("1 minute ago");
    expect(timeSince("2026-11-11T10:00:00Z")).toBe("2 hours ago");
    expect(timeSince("2026-11-08T12:00:00Z")).toBe("3 days ago");
  });
});
