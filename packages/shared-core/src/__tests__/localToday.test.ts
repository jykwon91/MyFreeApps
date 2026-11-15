import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localToday } from "../utils/localToday";

describe("localToday", () => {
  beforeEach(() => {
    vi.stubEnv("TZ", "America/Chicago");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("is still today on a US evening, when UTC has already moved on", () => {
    // 8pm on Nov 14 in Chicago is 2am on Nov 15 in UTC.
    vi.setSystemTime(new Date("2026-11-15T02:00:00Z"));
    expect(localToday()).toBe("2026-11-14");
  });

  it("stays in the current month on the evening of the last day", () => {
    vi.setSystemTime(new Date("2026-12-01T03:30:00Z"));
    expect(localToday()).toBe("2026-11-30");
  });

  it("turns over at local midnight", () => {
    vi.setSystemTime(new Date("2026-11-15T06:00:00Z"));
    expect(localToday()).toBe("2026-11-15");
  });
});
