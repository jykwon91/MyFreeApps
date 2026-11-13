import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { requestVerifyToken } from "../auth/requestVerifyToken";
import api from "../lib/api";
import { _resetPlatformForTests, configurePlatform } from "../platform/configurePlatform";

const originalAdapter = api.defaults.adapter;
let sent: AxiosRequestConfig | undefined;

function answering(status: number): AxiosAdapter {
  return async (config) => {
    sent = config;
    const response = { status, data: null, statusText: "", headers: {}, config };
    if (status < 400) return response;
    throw Object.assign(new Error(String(status)), { isAxiosError: true, config, response });
  };
}

beforeEach(() => {
  sent = undefined;
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

describe("requestVerifyToken", () => {
  it("posts the email to the verification endpoint", async () => {
    api.defaults.adapter = answering(202);
    await requestVerifyToken("u@e.com");
    expect(sent?.method).toBe("post");
    expect(sent?.url).toBe("/auth/request-verify-token");
    expect(JSON.parse(String(sent?.data))).toEqual({ email: "u@e.com" });
  });

  it("keeps the client's default timeout unless given one", async () => {
    api.defaults.adapter = answering(202);
    await requestVerifyToken("u@e.com");
    expect(sent?.timeout).toBe(api.defaults.timeout);
    await requestVerifyToken("u@e.com", 15000);
    expect(sent?.timeout).toBe(15000);
  });

  it("rejects when the server refuses, so the caller can say why", async () => {
    api.defaults.adapter = answering(429);
    await expect(requestVerifyToken("u@e.com")).rejects.toMatchObject({ response: { status: 429 } });
  });
});
