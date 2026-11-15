import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { transactionsApi } from "../store/transactionsApi";
import { vendorsApi } from "../store/vendorsApi";

const sent: InternalAxiosRequestConfig[] = [];

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

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
    return Promise.resolve({ data: { id: "t1", vendor_id: "v1" }, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
});

describe("deleteVendor", () => {
  it("refetches an open transaction detail, which held the deleted vendor_id", async () => {
    const store = makeStore();
    const subscription = store.dispatch(transactionsApi.endpoints.getTransaction.initiate("t1"));
    await settle();
    sent.length = 0;

    await store.dispatch(vendorsApi.endpoints.deleteVendor.initiate("v1"));
    await settle();

    expect(sent.map((config) => config.url)).toContain("/transactions/t1");
    subscription.unsubscribe();
  });
});
