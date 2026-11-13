import { describe, expect, it } from "vitest";
import { DISCOVER_CONFLICT_CODES } from "../constants/discoverConflictCodes";
import { DISCOVER_ACTION_MESSAGES } from "../constants/discoverMessages";
import { triageFailureMessage } from "../utils/triageFailureMessage";

const coded = (code: string) => ({ status: 409, data: { detail: { code, message: "The server's wording" } } });

describe("triageFailureMessage", () => {
  it("explains an already-applied 409 as the posting being in Applications", () => {
    const conflict = coded(DISCOVER_CONFLICT_CODES.alreadyApplied);
    expect(triageFailureMessage(conflict, DISCOVER_ACTION_MESSAGES.dismissFailed)).toBe(DISCOVER_ACTION_MESSAGES.alreadyApplied);
    expect(triageFailureMessage(conflict, DISCOVER_ACTION_MESSAGES.saveFailed)).toBe(DISCOVER_ACTION_MESSAGES.alreadyApplied);
  });

  it("explains a duplicate 409 as the posting being in Discover from another source", () => {
    expect(triageFailureMessage(coded(DISCOVER_CONFLICT_CODES.duplicate), DISCOVER_ACTION_MESSAGES.saveFailed)).toBe(
      DISCOVER_ACTION_MESSAGES.duplicate,
    );
  });

  it("explains a no-longer-listed 409 as the posting being no longer listed", () => {
    expect(triageFailureMessage(coded(DISCOVER_CONFLICT_CODES.noLongerListed), DISCOVER_ACTION_MESSAGES.restoreFailed)).toBe(
      DISCOVER_ACTION_MESSAGES.noLongerListed,
    );
  });

  it("passes on the server's reason for any other failure, an uncoded 409 included", () => {
    expect(triageFailureMessage({ status: 404, data: { detail: "Discovery resource not found" } }, DISCOVER_ACTION_MESSAGES.dismissFailed)).toBe(
      "Discovery resource not found",
    );
    expect(triageFailureMessage({ status: 409, data: { detail: "Try again in a moment" } }, DISCOVER_ACTION_MESSAGES.saveFailed)).toBe(
      "Try again in a moment",
    );
  });

  it("falls back to the action's own message when the server gave no reason", () => {
    expect(triageFailureMessage({ status: 500 }, DISCOVER_ACTION_MESSAGES.dismissFailed)).toBe(DISCOVER_ACTION_MESSAGES.dismissFailed);
    expect(triageFailureMessage(new Error("network"), DISCOVER_ACTION_MESSAGES.saveFailed)).toBe(DISCOVER_ACTION_MESSAGES.saveFailed);
  });
});
