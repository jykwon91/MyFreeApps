import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../store/companiesApi";
import "../store/discoverApi";
import "../store/jobAnalysisApi";

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
    orgStore: { get: () => null },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    sent.push(config);
    const isList = config.method === "get" && String(config.url) === "/companies";
    const data = isList ? { items: [], total: 0 } : { id: "new" };
    return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
});

const companyListLoads = () =>
  sent.filter(({ method, url }) => method === "get" && String(url) === "/companies").length;

describe("the Companies list after a mutation that can create a company", () => {
  it.each([
    ["Discover -> Promote", () => endpoints.promoteDiscoveredJob.initiate("job-1")],
    ["Analyze -> Add to Applications", () => endpoints.applyFromAnalysis.initiate("analysis-1")],
  ])("refetches (%s)", async (_name, mutate) => {
    const store = makeStore();
    await store.dispatch(endpoints.listCompanies.initiate());
    expect(companyListLoads()).toBe(1);

    await store.dispatch(mutate());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(companyListLoads()).toBe(2);
  });
});
