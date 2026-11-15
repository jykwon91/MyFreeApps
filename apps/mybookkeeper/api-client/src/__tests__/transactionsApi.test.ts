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
    const rows = Array.from({ length: count }, (_, index) => ({ id: `${sent.length}-${index}` }));
    const data = config.url?.startsWith("/transactions/page") ? { items: rows, total: count, has_more: false } : rows;
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

    expect(sent.map((request) => request.url)).toEqual([
      `/transactions?to_review=true&limit=${TRANSACTION_PAGE_SIZE}&offset=0`,
      `/transactions?to_review=true&limit=${TRANSACTION_PAGE_SIZE}&offset=${TRANSACTION_PAGE_SIZE}`,
    ]);
    expect(sent.every((request) => request.params === undefined)).toBe(true);
    expect(second.hasNextPage).toBe(false);
    expect(second.data?.pages.flat()).toHaveLength(TRANSACTION_PAGE_SIZE + 3);
  });

  it("sends list filters as repeated keys, never as statuses[]", async () => {
    const store = makeStore();
    await store.dispatch(transactionsApi.endpoints.listTransactionPages.initiate({ statuses: ["pending", "approved"] }));

    expect(sent.map((request) => request.url)).toEqual([
      `/transactions?statuses=pending&statuses=approved&limit=${TRANSACTION_PAGE_SIZE}&offset=0`,
    ]);
  });
});

describe("listTransactions", () => {
  it("sends list filters as repeated keys, never as statuses[]", async () => {
    const store = makeStore();
    await store.dispatch(
      transactionsApi.endpoints.listTransactions.initiate({ statuses: ["pending", "approved"], sort_by: "amount", limit: 10 }),
    );

    expect(sent.map((request) => request.url)).toEqual(["/transactions?statuses=pending&statuses=approved&sort_by=amount&limit=10"]);
    expect(sent[0]?.params).toBeUndefined();
  });

  it("asks for the bare list with no filters", async () => {
    const store = makeStore();
    await store.dispatch(transactionsApi.endpoints.listTransactions.initiate({}));

    expect(sent.map((request) => request.url)).toEqual(["/transactions"]);
  });
});

describe("getTransactionPage", () => {
  it("asks for one page by limit and offset, with list filters as repeated keys", async () => {
    const store = makeStore();
    await store.dispatch(
      transactionsApi.endpoints.getTransactionPage.initiate({
        statuses: ["pending", "approved"],
        property_ids: ["p1", "unassigned"],
        sort_by: "property_id",
        sort_dir: "asc",
        limit: 25,
        offset: 50,
      }),
    );

    expect(sent.map((request) => request.url)).toEqual([
      "/transactions/page?statuses=pending&statuses=approved&property_ids=p1&property_ids=unassigned&sort_by=property_id&sort_dir=asc&limit=25&offset=50",
    ]);
  });
});

describe("getTransactionPage multi-column sort", () => {
  it("sends each sort key as a repeated param, most significant first", async () => {
    const store = makeStore();
    await store.dispatch(
      transactionsApi.endpoints.getTransactionPage.initiate({ sort: ["property_id:asc", "amount:desc"], limit: 25, offset: 0 }),
    );

    expect(sent.map((request) => request.url)).toEqual([
      "/transactions/page?sort=property_id%3Aasc&sort=amount%3Adesc&limit=25&offset=0",
    ]);
  });
});

describe("listTransactionSelection", () => {
  it("asks for every matching row with the same filters", async () => {
    const store = makeStore();
    await store.dispatch(transactionsApi.endpoints.listTransactionSelection.initiate({ categories: ["rent", "utilities"], vendor: "A&B" }));

    expect(sent.map((request) => request.url)).toEqual(["/transactions/selection?vendor=A%26B&categories=rent&categories=utilities"]);
  });
});
