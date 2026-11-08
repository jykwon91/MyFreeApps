import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../store/reconciliationApi";

const sent: InternalAxiosRequestConfig[] = [];

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

type Initiate = { initiate: (arg?: unknown) => Parameters<ReturnType<typeof makeStore>["dispatch"]>[0] };
const endpoints = baseApi.endpoints as unknown as Record<string, Initiate>;

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => "w1" },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    sent.push(config);
    return Promise.resolve({ data: config.method === "delete" ? "" : [], status: config.method === "delete" ? 204 : 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
});

describe("reconciliationApi", () => {
  it("deletes a 1099 and refetches the sources list", async () => {
    const store = makeStore();
    store.dispatch(endpoints.listSources.initiate({ tax_year: 2025 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await store.dispatch(endpoints.deleteReconciliationSource.initiate("s1"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent.map((config) => `${config.method} ${config.url}`)).toEqual([
      "get /reconciliation/sources",
      "delete /reconciliation/sources/s1",
      "get /reconciliation/sources",
    ]);
  });
});
