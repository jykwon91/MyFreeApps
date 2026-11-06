import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../store/integrationsApi";
import "../store/membersApi";

const sent: InternalAxiosRequestConfig[] = [];

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

type Initiate = { initiate: (arg?: unknown) => Parameters<ReturnType<typeof makeStore>["dispatch"]>[0] };
const endpoints = baseApi.endpoints as unknown as Record<string, Initiate>;

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => "w1" },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    sent.push(config);
    return Promise.resolve({ data: [], status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
});

describe("membersApi", () => {
  it("reloads the integrations after removing a member, since their Gmail connection goes with them", async () => {
    const store = makeStore();
    store.dispatch(endpoints.getIntegrations.initiate());
    await tick();
    await store.dispatch(endpoints.removeMember.initiate({ orgId: "w1", userId: "u2" }));
    await tick();
    expect(sent.map((config) => `${config.method} ${config.url}`)).toEqual([
      "get /integrations",
      "delete /organizations/w1/members/u2",
      "get /integrations",
    ]);
  });

  it("reloads the integrations after a role change, since a new viewer's Gmail connection is removed", async () => {
    const store = makeStore();
    store.dispatch(endpoints.getIntegrations.initiate());
    await tick();
    await store.dispatch(endpoints.updateMemberRole.initiate({ orgId: "w1", userId: "u2", orgRole: "viewer" }));
    await tick();
    expect(sent.map((config) => `${config.method} ${config.url}`)).toEqual([
      "get /integrations",
      "patch /organizations/w1/members/u2/role",
      "get /integrations",
    ]);
  });
});
