import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dismissalSummary } from "../utils/dismissalSummary";

describe("dismissalSummary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-13T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("says when and why a posting was dismissed", () => {
    expect(dismissalSummary({ dismissed_at: "2026-11-11T12:00:00Z", dismissed_reason: "wrong_stack" })).toBe(
      "Dismissed 2 days ago · Wrong tech stack",
    );
  });

  it("leaves the reason out when none was given", () => {
    expect(dismissalSummary({ dismissed_at: "2026-11-13T09:00:00Z", dismissed_reason: null })).toBe("Dismissed 3 hours ago");
  });

  it("leaves out a reason this client doesn't know", () => {
    expect(dismissalSummary({ dismissed_at: "2026-11-13T09:00:00Z", dismissed_reason: "brand_new_reason" })).toBe("Dismissed 3 hours ago");
  });

  it("is null for a posting that isn't dismissed", () => {
    expect(dismissalSummary({ dismissed_at: null, dismissed_reason: null })).toBeNull();
  });
});
