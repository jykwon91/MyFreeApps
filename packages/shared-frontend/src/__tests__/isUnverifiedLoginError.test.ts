import { describe, it, expect } from "vitest";
import { isUnverifiedLoginError } from "../utils/isUnverifiedLoginError";

describe("isUnverifiedLoginError", () => {
  it("is true for the axios and RTK shapes of LOGIN_USER_NOT_VERIFIED", () => {
    const axiosErr = Object.assign(new Error("Request failed with status code 400"), {
      response: { status: 400, data: { detail: "LOGIN_USER_NOT_VERIFIED" } },
    });
    expect(isUnverifiedLoginError(axiosErr)).toBe(true);
    expect(isUnverifiedLoginError({ status: 400, data: { detail: "LOGIN_USER_NOT_VERIFIED" } })).toBe(true);
  });

  it("is false for any other failure", () => {
    expect(isUnverifiedLoginError({ data: { detail: "LOGIN_BAD_CREDENTIALS" } })).toBe(false);
    expect(isUnverifiedLoginError(new Error("network down"))).toBe(false);
    expect(isUnverifiedLoginError(undefined)).toBe(false);
  });
});
