import { describe, expect, it } from "vitest";
import { usageBlock } from "../utils/usageBlock";

describe("usageBlock", () => {
  it("lets the learner start before usage loads, and while there's budget left", () => {
    expect(usageBlock(undefined)).toBeNull();
    expect(usageBlock({ remaining_fraction: 0.4, cap_reached: false, tutor_available: true })).toBeNull();
  });

  it("blocks when today's budget is used up", () => {
    expect(usageBlock({ remaining_fraction: 0, cap_reached: true, tutor_available: true })).toBe("daily_limit");
  });

  it("says the tutor is unavailable before it says the budget is used up", () => {
    expect(usageBlock({ remaining_fraction: 0, cap_reached: true, tutor_available: false })).toBe("unavailable");
  });
});
