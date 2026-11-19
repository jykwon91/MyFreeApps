import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DRILL_DOWN_PAGE_SIZE } from "../constants/transactionPaging";
import { transactionsApi } from "../store/transactionsApi";
import { drillDownAmountTotal, drillDownListParams } from "../utils/drillDown";

/** More rows than two pages hold, so reaching the last needs offset paging. */
const ROW_COUNT = DRILL_DOWN_PAGE_SIZE * 2 + 7;
const sent: InternalAxiosRequestConfig[] = [];

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
    const query = new URL(config.url ?? "", "http://test").searchParams;
    const offset = Number(query.get("offset"));
    const limit = Number(query.get("limit"));
    const items = Array.from({ length: Math.max(Math.min(limit, ROW_COUNT - offset), 0) }, (_, i) => ({ id: `t${offset + i}` }));
    const data = { items, total: ROW_COUNT, has_more: offset + items.length < ROW_COUNT, amount_total: "20700.00" };
    return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
});

describe("listDrillDownPages", () => {
  it("pages GET /transactions/page by offset until the server says there's no more, with its total on every page", async () => {
    const store = makeStore();
    const args = drillDownListParams({ label: "Expenses", type: "expenses", propertyIds: ["p1"], categories: ["utilities"] });
    const initiate = transactionsApi.endpoints.listDrillDownPages.initiate;

    await store.dispatch(initiate(args));
    await store.dispatch(initiate(args, { direction: "forward" }));
    const last = await store.dispatch(initiate(args, { direction: "forward" }));

    const queries = sent.map((request) => new URL(request.url ?? "", "http://test"));
    expect(queries.every((url) => url.pathname === "/transactions/page")).toBe(true);
    expect(queries.map((url) => url.searchParams.get("offset"))).toEqual(["0", String(DRILL_DOWN_PAGE_SIZE), String(DRILL_DOWN_PAGE_SIZE * 2)]);
    expect(queries.every((url) => url.searchParams.get("limit") === String(DRILL_DOWN_PAGE_SIZE))).toBe(true);
    expect(queries[0].searchParams.getAll("property_ids")).toEqual(["p1"]);
    expect(queries[0].searchParams.getAll("categories")).toEqual(["utilities"]);
    expect(queries[0].searchParams.get("summary_kind")).toBe("expenses");
    expect(last.hasNextPage).toBe(false);
    const pages = last.data?.pages ?? [];
    expect(pages.flatMap((page) => page.items)).toHaveLength(ROW_COUNT);
    expect(drillDownAmountTotal(pages)).toBe(20700);
  });
});
