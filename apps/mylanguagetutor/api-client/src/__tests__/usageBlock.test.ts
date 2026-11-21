import { describe, expect, it } from "vitest";
import { usageBlock } from "../utils/usageBlock";

describe("usageBlock", () => {
  it("lets the learner start before usage loads, and while there's budget left", () => {
    expect(usageBlock(undefined)).toBeNull();
    expect(usageBlock({ remaining_fraction: 0.4, cap_reached: false, tutor_available: true, session_limit_reached: false })).toBeNull();
  });

  it("blocks when today's budget is used up", () => {
    expect(usageBlock({ remaining_fraction: 0, cap_reached: true, tutor_available: true, session_limit_reached: false })).toBe("daily_limit");
  });

  it("says the tutor is unavailable before it says the budget is used up", () => {
    expect(usageBlock({ remaining_fraction: 0, cap_reached: true, tutor_available: false, session_limit_reached: false })).toBe("unavailable");
  });

  it("blocks a conversation that has used all its turns, before the learner speaks", () => {
    expect(
      usageBlock({ remaining_fraction: 0.4, cap_reached: false, tutor_available: true, session_limit_reached: true }),
    ).toBe("session_limit");
  });

  it("puts the conversation's limit ahead of the daily one, since only the daily one lifts", () => {
    expect(
      usageBlock({ remaining_fraction: 0, cap_reached: true, tutor_available: true, session_limit_reached: true }),
    ).toBe("session_limit");
  });
});
