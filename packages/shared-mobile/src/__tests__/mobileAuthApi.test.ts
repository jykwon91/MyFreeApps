import api from "@platform/core/lib/api";
import { _resetPlatformForTests, configurePlatform } from "@platform/core/platform/configurePlatform";
import type { AxiosAdapter } from "axios";
import {
  fetchDevices,
  requestDeleteAccount,
  requestLogin,
  requestLogout,
  requestRefresh,
  revokeDevice,
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

  it("lists devices and signs one out", async () => {
    api.defaults.adapter = answering(200, [{ id: "1" }]);
    await expect(fetchDevices()).resolves.toEqual([{ id: "1" }]);
    const seen: string[] = [];
    api.defaults.adapter = async (config) => {
      seen.push(`${config.method} ${config.url}`);
      return { status: 204, data: null, statusText: "", headers: {}, config };
    };
    await revokeDevice("a/b");
    expect(seen).toEqual(["delete /auth/mobile/sessions/a%2Fb"]);
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
