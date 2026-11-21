import { describe, expect, it } from "vitest";
import { isSuggestionChangedError } from "../utils/isSuggestionChangedError";

describe("isSuggestionChangedError", () => {
  it("is true for the coded 409", () => {
    expect(isSuggestionChangedError({ status: 409, data: { detail: { code: "REFINEMENT_SUGGESTION_CHANGED", message: "x" } } })).toBe(true);
  });

  it.each([
    ["another 409", { status: 409, data: { detail: "Session is in status='completed'; cannot modify." } }],
    ["another code", { status: 409, data: { detail: { code: "DISCOVERED_JOB_DUPLICATE", message: "x" } } }],
    ["the code on another status", { status: 400, data: { detail: { code: "REFINEMENT_SUGGESTION_CHANGED" } } }],
    ["no answer", { status: "FETCH_ERROR" }],
    ["nothing", null],
  ])("is false for %s", (_label, error) => {
    expect(isSuggestionChangedError(error)).toBe(false);
  });
});
