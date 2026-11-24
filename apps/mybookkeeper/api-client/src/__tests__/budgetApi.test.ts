import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { budgetApi } from "../store/budgetApi";

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

describe("budgetApi", () => {
  it("asks for one month's budget", async () => {
    await newStore().dispatch(budgetApi.endpoints.getBudgetMonth.initiate("2026-11"));
    expect(seen[0]?.url).toBe("/budgets");
    expect(seen[0]?.params).toEqual({ month: "2026-11" });
  });

  it("saves a budget from a month onward", async () => {
    await newStore().dispatch(budgetApi.endpoints.setCategoryBudget.initiate({
      categoryId: "c1", data: { effective_month: "2026-11", amount_cents: 40_000 },
    }));
    expect(seen[0]?.method).toBe("put");
    expect(seen[0]?.url).toBe("/budgets/c1");
    expect(JSON.parse(String(seen[0]?.data))).toEqual({ effective_month: "2026-11", amount_cents: 40_000 });
  });

  it("sends the account only when one is picked", async () => {
    const store = newStore();
    await store.dispatch(budgetApi.endpoints.getCashFlow.initiate({ range: "12m", scope: "personal", accountId: null }));
    await store.dispatch(budgetApi.endpoints.getCashFlow.initiate({ range: "ytd", scope: "all", accountId: "a1" }));
    expect(seen[0]?.params).toEqual({ range: "12m", scope: "personal" });
    expect(seen[1]?.params).toEqual({ range: "ytd", scope: "all", account_id: "a1" });
  });
});
