import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import api from "../lib/api";
import { configurePlatform } from "../platform/configurePlatform";
import { baseApi } from "../store/baseApi";

const seen: InternalAxiosRequestConfig[] = [];
const recordingAdapter: AxiosAdapter = async (config) => {
  seen.push(config);
  return { data: { enabled: true }, status: 200, statusText: "OK", headers: {}, config };
};

// `import("../index")` has to run before the endpoint modules below load.
describe("the package index", () => {
  it("injects no endpoints: only the subpath imports do", async () => {
    await import("../index");
    expect(Object.keys(baseApi.endpoints)).toEqual([]);
  });
});

describe("the injected endpoints", () => {
  type LoadedEndpoints = Record<string, { initiate: (arg?: unknown) => never }>;
  let endpoints: LoadedEndpoints;
  let store: ReturnType<typeof makeStore>;

  function makeStore() {
    return configureStore({
      reducer: { [baseApi.reducerPath]: baseApi.reducer },
      middleware: (getDefault) => getDefault().concat(baseApi.middleware),
    });
  }

  function requests(): string[] {
    return seen.map((c) => `${c.method?.toUpperCase()} ${c.url}`);
  }

  async function settle(): Promise<void> {
    await Promise.all(store.dispatch(baseApi.util.getRunningQueriesThunk()));
  }

  beforeAll(async () => {
    configurePlatform({
      baseURL: "https://api.test",
      tokenStore: { get: () => null, set: () => {}, clear: () => {} },
      orgStore: { get: () => null },
      isOnLogin: () => false,
    });
    api.defaults.adapter = recordingAdapter;
    await import("../store/totpApi");
    await import("../store/userApi");
    await import("../store/accountApi");
    endpoints = baseApi.endpoints as unknown as LoadedEndpoints;
  });

  beforeEach(() => {
    seen.length = 0;
    store = makeStore();
  });

  it("verifyTotp refetches a subscribed TOTP status", async () => {
    await store.dispatch(endpoints.getTotpStatus.initiate());
    await store.dispatch(endpoints.verifyTotp.initiate({ code: "123456" }));
    await settle();
    expect(requests()).toEqual([
      "GET /auth/totp/status",
      "POST /auth/totp/verify",
      "GET /auth/totp/status",
    ]);
  });

  it("disableTotp refetches a subscribed TOTP status", async () => {
    await store.dispatch(endpoints.getTotpStatus.initiate());
    await store.dispatch(endpoints.disableTotp.initiate({ code: "123456" }));
    await settle();
    expect(requests()).toEqual([
      "GET /auth/totp/status",
      "POST /auth/totp/disable",
      "GET /auth/totp/status",
    ]);
  });

  it("setupTotp leaves the TOTP status cached", async () => {
    await store.dispatch(endpoints.getTotpStatus.initiate());
    await store.dispatch(endpoints.setupTotp.initiate());
    await settle();
    expect(requests()).toEqual(["GET /auth/totp/status", "POST /auth/totp/setup"]);
  });

  it("the user endpoints share no tag: updating doesn't refetch the current user", async () => {
    await store.dispatch(endpoints.getCurrentUser.initiate());
    await store.dispatch(endpoints.updateCurrentUser.initiate({ display_name: "Ada" }));
    await settle();
    expect(requests()).toEqual(["GET /users/me", "PATCH /users/me"]);
  });

  it("deleteAccount sends its body to DELETE /users/me", async () => {
    const body = { password: "pw", confirm_email: "u@e.com", totp_code: null };
    await store.dispatch(endpoints.deleteAccount.initiate(body));
    expect(requests()).toEqual(["DELETE /users/me"]);
    expect(JSON.parse(seen[0].data as string)).toEqual(body);
  });

  it("the reset that follows an identity change forgets the TOTP status", async () => {
    await store.dispatch(endpoints.getTotpStatus.initiate());
    store.dispatch(baseApi.util.resetApiState());
    await store.dispatch(endpoints.getTotpStatus.initiate());
    expect(requests()).toEqual(["GET /auth/totp/status", "GET /auth/totp/status"]);
  });
});
