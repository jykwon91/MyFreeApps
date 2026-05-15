import { describe, it, expect } from "vitest";
import { describeRegisterError } from "../registerErrorMessages";

/** axios rejection shape: server body at err.response.data, and the
 *  object is an Error whose .message is the unhelpful status string. */
function makeAxiosError(detail: unknown): unknown {
  const err = new Error("Request failed with status code 400") as Error & {
    response: { status: number; data: { detail: unknown } };
  };
  err.response = { status: 400, data: { detail } };
  return err;
}

/** RTK Query fetchBaseQuery shape. */
function makeRtkError(detail: unknown): unknown {
  return { status: 400, data: { detail } };
}

describe("describeRegisterError", () => {
  it("maps REGISTER_USER_ALREADY_EXISTS to a clear sign-in message (axios)", () => {
    const msg = describeRegisterError(
      makeAxiosError("REGISTER_USER_ALREADY_EXISTS"),
    );
    expect(msg).toContain("already exists");
    expect(msg).toContain("Sign in");
    // Must NOT leak the raw axios status message.
    expect(msg).not.toMatch(/status code/i);
  });

  it("maps REGISTER_USER_ALREADY_EXISTS for the RTK Query shape too", () => {
    const msg = describeRegisterError(
      makeRtkError("REGISTER_USER_ALREADY_EXISTS"),
    );
    expect(msg).toContain("already exists");
  });

  it("surfaces the reason for an invalid-password object body", () => {
    const msg = describeRegisterError(
      makeAxiosError({
        code: "REGISTER_INVALID_PASSWORD",
        reason: "This password has appeared in a known data breach.",
      }),
    );
    expect(msg).toMatch(/data breach/i);
  });

  it("falls back to extractErrorMessage for an unknown string code", () => {
    const msg = describeRegisterError(makeAxiosError("SOME_OTHER_CODE"));
    expect(msg).toBe("SOME_OTHER_CODE");
  });

  it("falls back to the Error message when there is no server body", () => {
    const msg = describeRegisterError(new Error("network down"));
    expect(msg).toBe("network down");
  });

  it("handles null / non-object input without throwing", () => {
    expect(describeRegisterError(null)).toMatch(/unexpected error/i);
  });
});
