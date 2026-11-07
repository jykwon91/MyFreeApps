import { describe, it, expect } from "vitest";
import { isRateLimitedError } from "../utils/isRateLimitedError";

describe("isRateLimitedError", () => {
  it("reads the status from an axios error", () => {
    const axiosErr = Object.assign(new Error("Request failed with status code 429"), {
      response: { status: 429, data: { detail: "Too many attempts" } },
    });
    expect(isRateLimitedError(axiosErr)).toBe(true);
  });

  it("reads the status from an RTK Query error", () => {
    expect(isRateLimitedError({ status: 429, data: { detail: "Too many attempts" } })).toBe(true);
  });

  it("is false for other statuses and non-HTTP failures", () => {
    expect(isRateLimitedError({ response: { status: 400, data: {} } })).toBe(false);
    expect(isRateLimitedError({ status: 400 })).toBe(false);
    expect(isRateLimitedError(new Error("Network Error"))).toBe(false);
    expect(isRateLimitedError(null)).toBe(false);
  });
});
