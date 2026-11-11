import { describe, expect, it } from "vitest";
import { RATE_LIMITED_MESSAGES } from "../constants/rateLimitedMessages";
import type { RateLimitedAction } from "../types/rate-limited-action";
import { rateLimitedMessage } from "../utils/rateLimitedMessage";

const ACTIONS = Object.keys(RATE_LIMITED_MESSAGES) as RateLimitedAction[];
const limited = { status: 429, data: { detail: "Too many attempts" } };

describe("rateLimitedMessage", () => {
  it("gives each action its own plain message for a 429", () => {
    for (const action of ACTIONS) {
      expect(rateLimitedMessage(limited, action)).toBe(RATE_LIMITED_MESSAGES[action]);
    }
    expect(new Set(ACTIONS.map((action) => rateLimitedMessage(limited, action))).size).toBe(ACTIONS.length);
  });

  it("names the action and never the server's generic line or an invented wait", () => {
    expect(rateLimitedMessage(limited, "companyResearch")).toBe(
      "You've run a lot of company research recently. Try again in a few minutes.",
    );
    for (const action of ACTIONS) {
      expect(rateLimitedMessage(limited, action)).not.toContain("Too many attempts");
      expect(rateLimitedMessage(limited, action)).not.toMatch(/\d/);
    }
  });

  it("is null for any other failure, so the caller keeps the server's own message", () => {
    expect(rateLimitedMessage({ status: 500, data: {} }, "resumeUpload")).toBeNull();
    expect(rateLimitedMessage({ status: 400 }, "resumeUpload")).toBeNull();
    expect(rateLimitedMessage(new Error("Network Error"), "resumeUpload")).toBeNull();
    expect(rateLimitedMessage(null, "resumeUpload")).toBeNull();
  });
});
