import { describe, it, expect } from "vitest";
import { isAlreadyVerifiedError } from "../utils/isAlreadyVerifiedError";

describe("isAlreadyVerifiedError", () => {
  it("is true for the axios and RTK shapes of VERIFY_USER_ALREADY_VERIFIED", () => {
    const axiosErr = Object.assign(new Error("Request failed with status code 400"), {
      response: { status: 400, data: { detail: "VERIFY_USER_ALREADY_VERIFIED" } },
    });
    expect(isAlreadyVerifiedError(axiosErr)).toBe(true);
    expect(isAlreadyVerifiedError({ status: 400, data: { detail: "VERIFY_USER_ALREADY_VERIFIED" } })).toBe(true);
  });

  it("is false for any other failure", () => {
    expect(isAlreadyVerifiedError({ data: { detail: "VERIFY_USER_BAD_TOKEN" } })).toBe(false);
    expect(isAlreadyVerifiedError(new Error("network down"))).toBe(false);
    expect(isAlreadyVerifiedError(null)).toBe(false);
  });
});
