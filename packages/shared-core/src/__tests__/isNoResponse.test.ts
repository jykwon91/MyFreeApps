import { describe, expect, it } from "vitest";
import { isNoResponse } from "../utils/isNoResponse";

describe("isNoResponse", () => {
  it("is true when the call got no answer", () => {
    expect(isNoResponse({ status: undefined, data: "boom" })).toBe(true);
    expect(isNoResponse({ status: "FETCH_ERROR", error: "Failed to fetch" })).toBe(true);
    expect(isNoResponse({ status: "TIMEOUT_ERROR", error: "timeout" })).toBe(true);
  });

  it("is false when the server answered", () => {
    expect(isNoResponse({ status: 500 })).toBe(false);
    expect(isNoResponse({ status: 422, data: {} })).toBe(false);
    expect(isNoResponse({ status: "PARSING_ERROR" })).toBe(false);
  });

  it("is false for anything that isn't a failed call", () => {
    expect(isNoResponse(undefined)).toBe(false);
    expect(isNoResponse(null)).toBe(false);
    expect(isNoResponse("boom")).toBe(false);
    expect(isNoResponse(new Error("x"))).toBe(false);
  });
});
