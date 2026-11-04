import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TRANSACTION_PAGE_SIZE } from "../constants/transactionPaging";
import { transactionsApi } from "../store/transactionsApi";

const sent: InternalAxiosRequestConfig[] = [];
let rowsPerRequest: number[] = [];

function makeStore() {
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
    sent.push(config);
    const count = rowsPerRequest.shift() ?? 0;
    const data = Array.from({ length: count }, (_, index) => ({ id: `${sent.length}-${index}` }));
    return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
  rowsPerRequest = [];
});

describe("listTransactionPages", () => {
  it("asks for the next page after a full one and stops after a short one", async () => {
    const store = makeStore();
    rowsPerRequest = [TRANSACTION_PAGE_SIZE, 3];
    const initiate = transactionsApi.endpoints.listTransactionPages.initiate;

    await store.dispatch(initiate({ to_review: true }));
    const second = await store.dispatch(initiate({ to_review: true }, { direction: "forward" }));

    expect(sent.map((request) => request.params)).toEqual([
      { to_review: true, limit: TRANSACTION_PAGE_SIZE, offset: 0 },
      { to_review: true, limit: TRANSACTION_PAGE_SIZE, offset: TRANSACTION_PAGE_SIZE },
    ]);
    expect(second.hasNextPage).toBe(false);
    expect(second.data?.pages.flat()).toHaveLength(TRANSACTION_PAGE_SIZE + 3);
  });
});
