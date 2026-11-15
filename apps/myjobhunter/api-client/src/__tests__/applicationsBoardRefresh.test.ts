import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../store/applicationsApi";
import "../store/jobAnalysisApi";

const sent: InternalAxiosRequestConfig[] = [];
const EMPTY_BOARD = { items: [], total: 0 };
let boardItems: { id: string }[] = [];

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
    const isBoard = config.method === "get" && String(config.url).includes("view=kanban");
    const data = isBoard ? { ...EMPTY_BOARD, items: boardItems, total: boardItems.length } : { id: "new" };
    return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
  boardItems = [];
});

const boardLoads = () => sent.filter(({ method, url }) => method === "get" && String(url).includes("view=kanban")).length;

describe("the Dashboard board after an application is added", () => {
  it.each([
    ["Applications -> Add", () => endpoints.createApplication.initiate({ company_id: "c1", role_title: "Engineer" })],
    ["Analyze -> Add to Applications", () => endpoints.applyFromAnalysis.initiate("analysis-1")],
  ])("refetches and shows the new application (%s)", async (_name, add) => {
    const store = makeStore();
    await store.dispatch(endpoints.listApplicationsKanban.initiate());
    expect(boardLoads()).toBe(1);

    boardItems = [{ id: "new" }];
    await store.dispatch(add());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(boardLoads()).toBe(2);
    const state = store.getState()[baseApi.reducerPath] as unknown as { queries: Record<string, { data?: { items: { id: string }[] } }> };
    const board = Object.values(state.queries).find((query) => query.data?.items);
    expect(board?.data?.items).toEqual([{ id: "new" }]);
  });
});
