import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listingsApi } from "../store/listingsApi";
import { mortgagesApi } from "../store/mortgagesApi";
import { propertiesApi } from "../store/propertiesApi";
import { summaryApi } from "../store/summaryApi";
import { transactionsApi } from "../store/transactionsApi";

const fetchCounts: Record<string, number> = {};

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
    const url = (config.url ?? "").split("?")[0];
    if (config.method === "get") fetchCounts[url] = (fetchCounts[url] ?? 0) + 1;
    const data = url === "/mortgages" || url === "/listings" ? { items: [], total: 0 } : url === "/summary" ? {} : [];
    return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  for (const key of Object.keys(fetchCounts)) delete fetchCounts[key];
});

async function mutateWithSubscriptions(
  mutate: (store: ReturnType<typeof makeStore>) => Promise<unknown>,
): Promise<void> {
  const store = makeStore();
  const subscriptions = [
    store.dispatch(summaryApi.endpoints.getSummary.initiate()),
    store.dispatch(transactionsApi.endpoints.listTransactions.initiate({})),
    store.dispatch(mortgagesApi.endpoints.getMortgages.initiate()),
    store.dispatch(listingsApi.endpoints.getListings.initiate()),
  ];
  await Promise.all(subscriptions);
  await mutate(store);
  await new Promise((resolve) => setTimeout(resolve, 0));
  subscriptions.forEach((s) => s.unsubscribe());
}

describe("changing a property refreshes the data that depends on it", () => {
  it("deactivating or renaming refreshes totals, payments and names shown elsewhere", async () => {
    await mutateWithSubscriptions((store) =>
      store.dispatch(propertiesApi.endpoints.updateProperty.initiate({ id: "p1", data: { is_active: false } })));
    expect(fetchCounts["/summary"]).toBe(2);
    expect(fetchCounts["/transactions"]).toBe(2);
    expect(fetchCounts["/mortgages"]).toBe(2);
    expect(fetchCounts["/listings"]).toBe(1);
  });

  it("deleting also refreshes the listings that went with it", async () => {
    await mutateWithSubscriptions((store) =>
      store.dispatch(propertiesApi.endpoints.deleteProperty.initiate("p1")));
    expect(fetchCounts["/summary"]).toBe(2);
    expect(fetchCounts["/transactions"]).toBe(2);
    expect(fetchCounts["/mortgages"]).toBe(2);
    expect(fetchCounts["/listings"]).toBe(2);
  });
});
