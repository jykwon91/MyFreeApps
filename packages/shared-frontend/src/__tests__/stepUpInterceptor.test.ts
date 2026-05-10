import axios from "axios";
import type { AxiosInstance } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StepUpCancelledError } from "../auth/errors/StepUpCancelledError";
import { StepUpReauthRequiredError } from "../auth/errors/StepUpReauthRequiredError";
import {
  _resetForTests,
  cancel,
  getState,
  submitCode,
} from "../auth/stepUpController";
import { installStepUpInterceptor } from "../auth/stepUpInterceptor";

interface MockAdapterCall {
  url?: string;
  headers?: Record<string, string>;
}

interface MockResponse {
  status: number;
  headers?: Record<string, string>;
  data?: unknown;
}

function makeApi(responses: MockResponse[]): {
  api: AxiosInstance;
  calls: MockAdapterCall[];
} {
  const calls: MockAdapterCall[] = [];
  let i = 0;
  const api = axios.create({ baseURL: "http://test" });
  api.defaults.adapter = async (config) => {
    calls.push({
      url: config.url,
      headers: { ...(config.headers as Record<string, string>) },
    });
    const next = responses[i] ?? responses[responses.length - 1];
    i += 1;
    if (next.status >= 200 && next.status < 300) {
      return Promise.resolve({
        data: next.data ?? {},
        status: next.status,
        statusText: "OK",
        headers: next.headers ?? {},
        config,
      });
    }
    return Promise.reject({
      response: {
        status: next.status,
        statusText: "Err",
        headers: next.headers ?? {},
        data: next.data ?? {},
        config,
      },
      config,
      isAxiosError: true,
    });
  };
  installStepUpInterceptor(api);
  return { api, calls };
}

describe("stepUpInterceptor", () => {
  beforeEach(() => {
    _resetForTests();
    localStorage.clear();
  });
  afterEach(() => {
    _resetForTests();
  });

  it("retries with X-TOTP-Code header after user submits code", async () => {
    const { api, calls } = makeApi([
      { status: 401, headers: { "x-require-step-up": "totp" } },
      { status: 200, data: { ok: true } },
    ]);

    const requestPromise = api.get("/admin/foo");

    await new Promise((r) => setTimeout(r, 0));
    expect(getState().pending).toEqual({ kind: "totp" });

    submitCode("123456");
    const resp = await requestPromise;
    expect(resp.data).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
    expect(calls[1].headers?.["X-TOTP-Code"]).toBe("123456");
    expect(getState().pending).toBeNull();
  });

  it("rejects original request with StepUpCancelledError when user cancels", async () => {
    const { api } = makeApi([
      { status: 401, headers: { "x-require-step-up": "totp" } },
    ]);

    const requestPromise = api.get("/admin/foo");

    await new Promise((r) => setTimeout(r, 0));
    cancel("user_cancelled");

    await expect(requestPromise).rejects.toBeInstanceOf(StepUpCancelledError);
  });

  it("loops on wrong-code, succeeds after correct code", async () => {
    const { api, calls } = makeApi([
      { status: 401, headers: { "x-require-step-up": "totp" } },
      { status: 401, headers: { "x-require-step-up": "totp" } },
      { status: 200, data: { ok: true } },
    ]);

    const requestPromise = api.get("/admin/foo");
    await vi.waitFor(() => expect(getState().pending).not.toBeNull());

    submitCode("111111");
    await vi.waitFor(() => expect(getState().errorMessage).toBeTruthy());
    expect(getState().attempt).toBe(1);

    submitCode("123456");
    const resp = await requestPromise;
    expect(resp.data).toEqual({ ok: true });
    expect(calls).toHaveLength(3);
    expect(calls[1].headers?.["X-TOTP-Code"]).toBe("111111");
    expect(calls[2].headers?.["X-TOTP-Code"]).toBe("123456");
  });

  it("rejects with StepUpReauthRequiredError on reauth flavor", async () => {
    const { api } = makeApi([
      { status: 401, headers: { "x-require-step-up": "reauth" } },
    ]);
    localStorage.setItem("token", "stale-jwt");

    const requestPromise = api.get("/admin/foo");
    await expect(requestPromise).rejects.toBeInstanceOf(
      StepUpReauthRequiredError,
    );
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("does not retry the same request twice (cap)", async () => {
    const { api, calls } = makeApi([
      { status: 401, headers: { "x-require-step-up": "totp" } },
      { status: 401, headers: { "x-require-step-up": "totp" } },
    ]);

    const requestPromise = api.get("/admin/foo");
    await new Promise((r) => setTimeout(r, 0));
    submitCode("111111");
    await new Promise((r) => setTimeout(r, 0));
    cancel("user_cancelled");

    await expect(requestPromise).rejects.toBeInstanceOf(StepUpCancelledError);
    expect(calls).toHaveLength(2);
  });

  it("does not engage on non-step-up 401", async () => {
    const { api } = makeApi([{ status: 401, headers: {} }]);
    await expect(api.get("/foo")).rejects.toBeDefined();
    expect(getState().pending).toBeNull();
  });

  it("does not engage on non-401 errors", async () => {
    const { api } = makeApi([{ status: 500, data: { detail: "boom" } }]);
    await expect(api.get("/foo")).rejects.toBeDefined();
    expect(getState().pending).toBeNull();
  });

  it("queues concurrent step-up retries behind one modal", async () => {
    const { api, calls } = makeApi([
      { status: 401, headers: { "x-require-step-up": "totp" } },
      { status: 401, headers: { "x-require-step-up": "totp" } },
      { status: 401, headers: { "x-require-step-up": "totp" } },
      { status: 200, data: { id: 1 } },
      { status: 200, data: { id: 2 } },
      { status: 200, data: { id: 3 } },
    ]);

    const r1 = api.get("/admin/a");
    const r2 = api.get("/admin/b");
    const r3 = api.get("/admin/c");

    await new Promise((r) => setTimeout(r, 0));
    expect(getState().pending).toEqual({ kind: "totp" });

    submitCode("999999");

    const [resp1, resp2, resp3] = await Promise.all([r1, r2, r3]);
    expect(resp1.data).toEqual({ id: 1 });
    expect(resp2.data).toEqual({ id: 2 });
    expect(resp3.data).toEqual({ id: 3 });
    expect(calls).toHaveLength(6);
    for (let i = 3; i < 6; i++) {
      expect(calls[i].headers?.["X-TOTP-Code"]).toBe("999999");
    }
  });
});
