import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../store/attributionApi";

const sent: InternalAxiosRequestConfig[] = [];

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

type Initiate = { initiate: (arg?: unknown) => Parameters<ReturnType<typeof makeStore>["dispatch"]>[0] };
const endpoints = baseApi.endpoints as unknown as Record<string, Initiate>;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => "w1" },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    sent.push(config);
    const data = config.url?.endsWith("/queue") || config.url?.includes("review-queue")
      ? { items: [], total: 0, pending_count: 0 }
      : { ok: true, transaction_id: "t1" };
    return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
});

describe("attributeTransactionManually", () => {
  it("links the payment to the tenant and refetches the review queue", async () => {
    const store = makeStore();
    store.dispatch(endpoints.getAttributionReviewQueue.initiate());
    await settle();
    await store.dispatch(endpoints.attributeTransactionManually.initiate({ transaction_id: "t1", applicant_id: "a1" }));
    await settle();
    expect(sent.map((config) => `${config.method} ${config.url}`)).toEqual([
      "get /transactions/attribution-review-queue",
      "post /transactions/t1/attribute",
      "get /transactions/attribution-review-queue",
    ]);
    expect(JSON.parse(sent[1]?.data as string)).toEqual({ applicant_id: "a1" });
  });
});

describe("getPropertyPnl", () => {
  it("asks for the range it was given", async () => {
    const store = makeStore();
    await store.dispatch(endpoints.getPropertyPnl.initiate({ since: "2026-05-01", until: "2026-05-17" }));
    expect(sent.map((config) => `${config.method} ${config.url}`)).toEqual(["get /dashboard/property-pnl"]);
    expect(sent[0]?.params).toEqual({ since: "2026-05-01", until: "2026-05-17" });
  });
});
