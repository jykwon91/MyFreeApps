import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter } from "axios";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "../store/analyticsApi";

const reads: { url: string; params: unknown }[] = [];

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
    reads.push({ url: config.url ?? "", params: config.params });
    return Promise.resolve({ data: {}, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  reads.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("analyticsApi", () => {
  it("getRentalRoi measures the 12-month window from the host's local date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 6pm on Oct 31 in the Pacific: UTC is already Nov 1.
    vi.setSystemTime(new Date(2026, 9, 31, 18, 0));
    await makeStore().dispatch(endpoints.getRentalRoi.initiate({ targetReturnPct: 8 }));
    expect(reads).toEqual([
      { url: "/analytics/rental-roi", params: { target_return_pct: 8, today: "2026-10-31" } },
    ]);
  });
});
