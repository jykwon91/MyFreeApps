/**
 * Tests for the JD URL extract error-routing helpers.
 *
 * The frontend reads two pieces of information off RTK Query's error
 * response (`{ status, data }`):
 *   1. `isAuthRequiredError` — distinguishes the 422 + auth_required
 *      case from every other 422 (which are validation errors).
 *   2. `describeExtractError` — picks a user-friendly sentence based on
 *      the status code, with a sensible fallback.
 */
import { describe, it, expect } from "vitest";
import { describeExtractError, isAuthRequiredError } from "../jdErrorRouting";

describe("isAuthRequiredError", () => {
  it("matches a 422 response with detail 'auth_required'", () => {
    expect(
      isAuthRequiredError({ status: 422, data: { detail: "auth_required" } }),
    ).toBe(true);
  });

  it("does NOT match a 422 with a different detail", () => {
    expect(
      isAuthRequiredError({ status: 422, data: { detail: "some_other_error" } }),
    ).toBe(false);
  });

  it("does NOT match a 422 with no body", () => {
    expect(isAuthRequiredError({ status: 422, data: undefined })).toBe(false);
  });

  it("does NOT match a 400 with auth_required body", () => {
    // Status code is part of the contract — only 422 is the documented
    // auth-required signal.
    expect(
      isAuthRequiredError({ status: 400, data: { detail: "auth_required" } }),
    ).toBe(false);
  });

  it("does NOT match a 504 timeout", () => {
    expect(isAuthRequiredError({ status: 504, data: "Timeout" })).toBe(false);
  });

  it("does NOT match a non-object error", () => {
    expect(isAuthRequiredError("error string")).toBe(false);
    expect(isAuthRequiredError(null)).toBe(false);
    expect(isAuthRequiredError(undefined)).toBe(false);
    expect(isAuthRequiredError(42)).toBe(false);
  });

  it("does NOT match an Error instance", () => {
    expect(isAuthRequiredError(new Error("boom"))).toBe(false);
  });
});

describe("describeExtractError", () => {
  it("explains 504 as a slow-page timeout", () => {
    expect(describeExtractError({ status: 504, data: "" })).toMatch(/took too long/i);
  });

  it("explains 502 as an extraction failure", () => {
    expect(describeExtractError({ status: 502, data: "" })).toMatch(/couldn't extract/i);
  });

  it("explains 429 as a rate-limit hit", () => {
    expect(describeExtractError({ status: 429, data: "" })).toMatch(/too many/i);
  });

  it("explains 400 as a malformed URL", () => {
    expect(describeExtractError({ status: 400, data: "" })).toMatch(/url.*right/i);
  });

  it("falls back to a generic message for unknown errors", () => {
    expect(describeExtractError({ status: 599, data: "Unknown" })).toMatch(/couldn't fetch/i);
    expect(describeExtractError(null)).toMatch(/couldn't fetch/i);
    expect(describeExtractError("some string")).toMatch(/couldn't fetch/i);
  });
});
