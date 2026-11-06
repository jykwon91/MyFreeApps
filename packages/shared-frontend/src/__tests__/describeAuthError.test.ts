import { describe, it, expect } from "vitest";
import { describeAuthError } from "../utils/describeAuthError";

/** axios rejection: body at err.response.data, and .message is the status line. */
function axiosError(detail: unknown): unknown {
  return Object.assign(new Error("Request failed with status code 400"), {
    response: { status: 400, data: { detail } },
  });
}

describe("describeAuthError", () => {
  it("maps REGISTER_USER_ALREADY_EXISTS (axios) to a sign-in message", () => {
    const msg = describeAuthError(axiosError("REGISTER_USER_ALREADY_EXISTS"));
    expect(msg).toBe("An account with this email already exists. Sign in instead.");
  });

  it("maps codes in the RTK Query shape too", () => {
    expect(describeAuthError({ status: 400, data: { detail: "VERIFY_USER_BAD_TOKEN" } })).toBe(
      "This verification link is invalid or has expired.",
    );
  });

  it("shows the reason of an invalid-password body", () => {
    const msg = describeAuthError(
      axiosError({
        code: "REGISTER_INVALID_PASSWORD",
        reason: "This password has appeared in a known data breach.",
      }),
    );
    expect(msg).toBe("This password has appeared in a known data breach.");
  });

  it("passes an unknown code through", () => {
    expect(describeAuthError(axiosError("SOME_OTHER_CODE"))).toBe("SOME_OTHER_CODE");
  });

  it("does not treat object prototype names as codes", () => {
    expect(describeAuthError(axiosError("constructor"))).toBe("constructor");
  });

  it("falls back to the Error message, then the generic message", () => {
    expect(describeAuthError(new Error("network down"))).toBe("network down");
    expect(describeAuthError(null)).toBe("An unexpected error occurred");
  });
});
