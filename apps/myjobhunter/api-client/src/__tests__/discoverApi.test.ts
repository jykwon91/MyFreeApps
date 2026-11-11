import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../store/discoverApi";

const sent: InternalAxiosRequestConfig[] = [];
let respond: (config: InternalAxiosRequestConfig) => { status: number; data: unknown } = () => page([], 0);

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

type Initiate = {
  initiate: (arg?: unknown, options?: { direction?: "forward" | "backward" }) => Parameters<ReturnType<typeof makeStore>["dispatch"]>[0];
};
const endpoints = baseApi.endpoints as unknown as Record<string, Initiate>;

function page(ids: string[], total: number) {
  return { status: 200, data: { items: ids.map((id) => ({ id })), total, has_more: false, state: "inbox", scored_count: 0, total_count: total } };
}

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    sent.push(config);
    const { status, data } = respond(config);
    return Promise.resolve({ data, status, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
  respond = () => page([], 0);
});

describe("listDiscoveredJobsPages", () => {
  it("asks for the first page of a view", async () => {
    await makeStore().dispatch(endpoints.listDiscoveredJobsPages.initiate({ state: "saved" }));
    expect(api.getUri(sent[0])).toBe("/api/discover?state=saved&limit=50&offset=0");
  });

  it("filters by saved search", async () => {
    await makeStore().dispatch(endpoints.listDiscoveredJobsPages.initiate({ state: "inbox", source_id: "s1" }));
    expect(api.getUri(sent[0])).toBe("/api/discover?state=inbox&source_id=s1&limit=50&offset=0");
  });

  it("loads the next page where the last one ended, and stops once all are loaded", async () => {
    const store = makeStore();
    respond = (config) => (config.params.offset === 0 ? page(["j1", "j2"], 3) : page(["j3"], 3));
    await store.dispatch(endpoints.listDiscoveredJobsPages.initiate({ state: "inbox" }));
    await store.dispatch(endpoints.listDiscoveredJobsPages.initiate({ state: "inbox" }, { direction: "forward" }));
    await store.dispatch(endpoints.listDiscoveredJobsPages.initiate({ state: "inbox" }, { direction: "forward" }));
    expect(sent.map((config) => api.getUri(config))).toEqual([
      "/api/discover?state=inbox&limit=50&offset=0",
      "/api/discover?state=inbox&limit=50&offset=2",
    ]);
  });
});
