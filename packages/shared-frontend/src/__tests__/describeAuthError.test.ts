import { describe, it, expect } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
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

  it("maps the sign-in failures", () => {
    expect(describeAuthError(axiosError("LOGIN_BAD_CREDENTIALS"))).toBe(
      "Incorrect email or password. Please try again.",
    );
    expect(describeAuthError(axiosError("LOGIN_USER_NOT_VERIFIED"))).toBe(
      "Please verify your email before signing in.",
    );
    expect(describeAuthError(axiosError("invalid_totp"))).toBe(
      "Invalid authentication code. Please try again.",
    );
    expect(describeAuthError(axiosError("Too many attempts"))).toBe(
      "Too many attempts. Wait a few minutes and try again.",
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

  it("uses a plain fallback for an axios failure with no reason", () => {
    const config = { headers: new AxiosHeaders() };
    const badGateway = new AxiosError("Request failed with status code 502", "ERR_BAD_RESPONSE", config, null, {
      status: 502, statusText: "Bad Gateway", data: "", headers: {}, config,
    });
    expect(describeAuthError(badGateway)).toBe("Something went wrong. Please try again.");
    expect(describeAuthError(new AxiosError("Network Error", "ERR_NETWORK", config))).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("still reads the detail of a real AxiosError", () => {
    const config = { headers: new AxiosHeaders() };
    const err = new AxiosError("Request failed with status code 400", "ERR_BAD_REQUEST", config, null, {
      status: 400, statusText: "Bad Request", data: { detail: "LOGIN_BAD_CREDENTIALS" }, headers: {}, config,
    });
    expect(describeAuthError(err)).toBe("Incorrect email or password. Please try again.");
  });
});
