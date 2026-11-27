import api from "@platform/core/lib/api";
import { _resetPlatformForTests, configurePlatform } from "@platform/core/platform/configurePlatform";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import {
  fetchTwoFactorEnabled,
  requestDeleteAccount,
  requestLogin,
  requestLogout,
  requestPasswordReset,
  requestRefresh,
  requestRegister,
  resendVerificationEmail,
} from "../auth/mobileAuthApi";

const originalAdapter = api.defaults.adapter;

function answering(status: number, data: unknown): AxiosAdapter {
  return async (config) => {
    const response = { status, data, statusText: "", headers: {}, config };
    if (status < 400) return response;
    throw Object.assign(new Error(String(status)), { isAxiosError: true, config, response });
  };
}

const offline: AxiosAdapter = async (config) => {
  throw Object.assign(new Error("Network Error"), { isAxiosError: true, config });
};

beforeEach(() => {
  _resetPlatformForTests();
  configurePlatform({
    baseURL: "https://api.test",
    tokenStore: { get: () => null, set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
    refreshSession: async () => "unavailable",
  });
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

const credentials = { email: "a@example.com", password: "pw" };

describe("requestLogin", () => {
  it.each([
    [400, { detail: "LOGIN_BAD_CREDENTIALS" }, "bad_credentials"],
    [400, { detail: "LOGIN_USER_NOT_VERIFIED" }, "not_verified"],
    [401, { detail: "invalid_totp" }, "invalid_totp"],
    [429, { detail: "Too many requests" }, "rate_limited"],
    [503, {}, "unreachable"],
    [422, { detail: [] }, "unexpected"],
    [200, { detail: "totp_required" }, "totp_required"],
    [200, { detail: "something else" }, "unexpected"],
  ])("maps %i %j to %s", async (status, body, expected) => {
    api.defaults.adapter = answering(status, body);
    await expect(requestLogin(credentials, null)).resolves.toBe(expected);
  });

  it("calls an unreachable server what it is, not a wrong password", async () => {
    api.defaults.adapter = offline;
    await expect(requestLogin(credentials, null)).resolves.toBe("unreachable");
  });

  it("returns the tokens", async () => {
    const tokens = { access_token: "a", refresh_token: "r", session_id: "s" };
    api.defaults.adapter = answering(200, tokens);
    await expect(requestLogin(credentials, null)).resolves.toEqual(tokens);
  });
});

describe("requestRefresh", () => {
  it("is refused only by the server's own word for it", async () => {
    api.defaults.adapter = answering(401, { detail: "refresh_invalid" });
    await expect(requestRefresh("r")).resolves.toBe("refused");
  });

  it.each([
    [429, { detail: "Too many requests" }],
    [503, {}],
    [401, { detail: "something else" }],
  ])("treats %i %j as no answer", async (status, body) => {
    api.defaults.adapter = answering(status, body);
    await expect(requestRefresh("r")).resolves.toBe("no_answer");
  });

  it("treats being offline as no answer", async () => {
    api.defaults.adapter = offline;
    await expect(requestRefresh("r")).resolves.toBe("no_answer");
  });
});

describe("the rest", () => {
  it("reports whether a logout reached the server", async () => {
    api.defaults.adapter = answering(204, null);
    await expect(requestLogout("r")).resolves.toBe(true);
    api.defaults.adapter = offline;
    await expect(requestLogout("r")).resolves.toBe(false);
  });
});

describe("requestDeleteAccount", () => {
  const details = { email: "me@example.com", password: "pw", code: null };

  it.each([
    [403, "Incorrect password", { outcome: "wrong_password" }],
    [400, "Email confirmation does not match", { outcome: "email_mismatch" }],
    [400, "TOTP_CODE_REQUIRED", { outcome: "code_required" }],
    [403, "Invalid TOTP code", { outcome: "invalid_code" }],
    [409, "Remove them first.", { outcome: "refused", message: "Remove them first." }],
    [429, "Too many attempts", { outcome: "rate_limited" }],
    [422, "Nope", { outcome: "failed" }],
    [500, "Oops", { outcome: "unknown" }],
    [401, "Unauthorized", { outcome: "unknown" }],
  ])("reads a %i %s", async (status, detail, expected) => {
    api.defaults.adapter = answering(status, { detail });
    await expect(requestDeleteAccount(details)).resolves.toEqual(expected);
  });

  it("can't tell what happened when no answer comes back", async () => {
    api.defaults.adapter = offline;
    await expect(requestDeleteAccount(details)).resolves.toEqual({ outcome: "unknown" });
  });

  it("sends what the route asks for", async () => {
    let sent: unknown;
    api.defaults.adapter = async (config) => {
      sent = [config.method, config.url, JSON.parse(config.data as string)];
      return { status: 204, data: "", statusText: "", headers: {}, config };
    };
    await expect(requestDeleteAccount({ ...details, code: "123456" })).resolves.toEqual({ outcome: "deleted" });
    expect(sent).toEqual(["delete", "/users/me", { password: "pw", confirm_email: "me@example.com", totp_code: "123456" }]);
  });
});

describe("fetchTwoFactorEnabled", () => {
  it.each([true, false])("reads %s", async (enabled) => {
    api.defaults.adapter = answering(200, { enabled });
    await expect(fetchTwoFactorEnabled()).resolves.toBe(enabled);
  });

  it.each([["a web page", "<html></html>"], ["no field", {}], ["a string", { enabled: "false" }]])(
    "refuses %s rather than reading it as off",
    async (_name, data) => {
      api.defaults.adapter = answering(200, data);
      await expect(fetchTwoFactorEnabled()).rejects.toThrow();
    },
  );
});

describe("resendVerificationEmail", () => {
  it("posts the email with the sign-in timeout", async () => {
    let sent: InternalAxiosRequestConfig | undefined;
    api.defaults.adapter = async (config) => {
      sent = config;
      return { status: 202, data: null, statusText: "", headers: {}, config };
    };
    await expect(resendVerificationEmail("a@example.com")).resolves.toBe("sent");
    expect(sent?.url).toBe("/auth/request-verify-token");
    expect(JSON.parse(String(sent?.data))).toEqual({ email: "a@example.com" });
    expect(sent?.timeout).toBe(15000);
  });

  it.each([
    [429, "rate_limited"],
    [400, "failed"],
    [503, "failed"],
  ])("maps %i to %s", async (status, expected) => {
    api.defaults.adapter = answering(status, {});
    await expect(resendVerificationEmail("a@example.com")).resolves.toBe(expected);
  });

  it("fails rather than claiming it sent with no connection", async () => {
    api.defaults.adapter = offline;
    await expect(resendVerificationEmail("a@example.com")).resolves.toBe("failed");
  });
});

describe("requestRegister", () => {
  const details = { email: "a@example.com", password: "long enough pass", name: "  ", nameField: "display_name" } as const;

  it("posts the account with the captcha token and the sign-in timeout, leaving a blank name out", async () => {
    let sent: InternalAxiosRequestConfig | undefined;
    api.defaults.adapter = async (config) => {
      sent = config;
      return { status: 201, data: {}, statusText: "", headers: {}, config };
    };
    await expect(requestRegister(details, "tok")).resolves.toEqual({ outcome: "registered" });
    expect(sent?.url).toBe("/auth/register");
    expect(JSON.parse(String(sent?.data))).toEqual({ email: "a@example.com", password: "long enough pass" });
    expect(sent?.headers["X-Turnstile-Token"]).toBe("tok");
    expect(sent?.timeout).toBe(15000);
  });

  it("sends no captcha header without a token", async () => {
    let sent: InternalAxiosRequestConfig | undefined;
    api.defaults.adapter = async (config) => {
      sent = config;
      return { status: 201, data: {}, statusText: "", headers: {}, config };
    };
    await requestRegister({ ...details, name: "Bo", nameField: "name" }, "");
    expect(sent?.headers["X-Turnstile-Token"]).toBeUndefined();
    expect(JSON.parse(String(sent?.data))).toEqual(expect.objectContaining({ name: "Bo" }));
  });

  it.each([
    [400, { detail: "REGISTER_USER_ALREADY_EXISTS" }, { outcome: "failed", failure: "email_taken" }],
    [400, { detail: { code: "REGISTER_INVALID_PASSWORD", reason: "Too common." } }, { outcome: "weakPassword", reason: "Too common." }],
    [400, { detail: "captcha_expired_please_retry" }, { outcome: "failed", failure: "captcha_expired" }],
    [400, { detail: "Captcha token required" }, { outcome: "failed", failure: "captcha_rejected" }],
    [503, { detail: "captcha_service_unavailable" }, { outcome: "failed", failure: "captcha_unavailable" }],
    [429, {}, { outcome: "failed", failure: "rate_limited" }],
    [500, {}, { outcome: "failed", failure: "unreachable" }],
    [422, { detail: [{ loc: ["body", "email"] }] }, { outcome: "failed", failure: "invalid_email" }],
    [400, { detail: "NEW_CODE" }, { outcome: "failed", failure: "unexpected" }],
  ])("maps %i %j", async (status, data, expected) => {
    api.defaults.adapter = answering(status, data);
    await expect(requestRegister(details, "tok")).resolves.toEqual(expected);
  });

  it("calls no connection unreachable", async () => {
    api.defaults.adapter = offline;
    await expect(requestRegister(details, "tok")).resolves.toEqual({ outcome: "failed", failure: "unreachable" });
  });
});

describe("requestPasswordReset", () => {
  it("posts the email with the captcha token", async () => {
    let sent: InternalAxiosRequestConfig | undefined;
    api.defaults.adapter = async (config) => {
      sent = config;
      return { status: 202, data: null, statusText: "", headers: {}, config };
    };
    await expect(requestPasswordReset("a@example.com", "tok")).resolves.toEqual({ outcome: "sent" });
    expect(sent?.url).toBe("/auth/forgot-password");
    expect(JSON.parse(String(sent?.data))).toEqual({ email: "a@example.com" });
    expect(sent?.headers["X-Turnstile-Token"]).toBe("tok");
  });

  it("explains a refused captcha", async () => {
    api.defaults.adapter = answering(400, { detail: "captcha_verification_failed" });
    await expect(requestPasswordReset("a@example.com", "tok")).resolves.toEqual({ outcome: "failed", failure: "captcha_rejected" });
  });
});
