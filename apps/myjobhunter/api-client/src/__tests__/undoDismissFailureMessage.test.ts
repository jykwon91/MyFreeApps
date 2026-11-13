import { describe, expect, it } from "vitest";
import { DISCOVER_ACTION_MESSAGES } from "../constants/discoverMessages";
import { undoDismissFailureMessage } from "../utils/undoDismissFailureMessage";

const FALLBACK = DISCOVER_ACTION_MESSAGES.restoreFailed;

describe("undoDismissFailureMessage", () => {
  it("explains a 404 in plain language instead of the server's not-found detail", () => {
    expect(undoDismissFailureMessage({ status: 404, data: { detail: "Discovery resource not found" } }, FALLBACK)).toBe(
      DISCOVER_ACTION_MESSAGES.undoDismissGone,
    );
  });

  it("passes on the server's reason for any other failure", () => {
    expect(undoDismissFailureMessage({ status: 409, data: { detail: "Try again in a moment" } }, FALLBACK)).toBe("Try again in a moment");
  });

  it("falls back to the action's own message when the server gave no reason", () => {
    expect(undoDismissFailureMessage({ status: 500 }, DISCOVER_ACTION_MESSAGES.restoreFailed)).toBe(DISCOVER_ACTION_MESSAGES.restoreFailed);
    expect(undoDismissFailureMessage(new Error("network"), DISCOVER_ACTION_MESSAGES.undoFailed)).toBe(DISCOVER_ACTION_MESSAGES.undoFailed);
  });
});
