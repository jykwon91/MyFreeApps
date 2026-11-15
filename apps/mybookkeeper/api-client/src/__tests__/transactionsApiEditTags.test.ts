import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { classificationRulesApi } from "../store/classificationRulesApi";
import { rentReceiptsApi } from "../store/rentReceiptsApi";
import { transactionsApi } from "../store/transactionsApi";

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
    return Promise.resolve({ data: [], status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
});

describe("updateTransaction", () => {
  it("refetches the pending rent receipts and the classification rules", async () => {
    const store = makeStore();
    const receipts = store.dispatch(rentReceiptsApi.endpoints.getPendingReceipts.initiate());
    const rules = store.dispatch(classificationRulesApi.endpoints.listClassificationRules.initiate());
    await settle();
    sent.length = 0;

    await store.dispatch(transactionsApi.endpoints.updateTransaction.initiate({ id: "t1", data: { category: "repairs" } }));
    await settle();

    const urls = sent.map((config) => config.url);
    expect(urls).toContain("/rent-receipts/pending");
    expect(urls).toContain("/classification-rules");
    receipts.unsubscribe();
    rules.unsubscribe();
  });
});
