import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { summaryApi } from "../store/summaryApi";
import { taxReturnsApi } from "../store/taxReturnsApi";

let seen: InternalAxiosRequestConfig[] = [];

function newStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => "w1" },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    seen.push(config);
    return Promise.resolve({ data: {}, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  seen = [];
});

const summaryReads = () => seen.filter((c) => c.method === "get" && String(c.url).includes("summary")).length;

describe("taxReturnsApi writes keep the report fresh", () => {
  it("refetches a watched summary after an override", async () => {
    const store = newStore();
    const watch = store.dispatch(summaryApi.endpoints.getSummary.initiate());
    await watch;
    const before = summaryReads();
    await store.dispatch(
      taxReturnsApi.endpoints.overrideField.initiate({ return_id: "r1", field_id: "f1", field_type: "numeric", value: null, override_reason: "why" }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(summaryReads()).toBeGreaterThan(before);
    expect(JSON.parse(String(seen.find((c) => c.method === "patch")?.data))).toEqual({ override_reason: "why", value_numeric: null });
    watch.unsubscribe();
  });

  it("refetches a watched summary after a recompute", async () => {
    const store = newStore();
    const watch = store.dispatch(summaryApi.endpoints.getSummary.initiate());
    await watch;
    const before = summaryReads();
    await store.dispatch(taxReturnsApi.endpoints.recompute.initiate("r1"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(summaryReads()).toBeGreaterThan(before);
    watch.unsubscribe();
  });
});
