import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { holdingsApi } from "../store/holdingsApi";

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

describe("holdingsApi", () => {
  it("sends the account only when one is picked", async () => {
    const store = newStore();
    await store.dispatch(holdingsApi.endpoints.listHoldings.initiate(null));
    await store.dispatch(holdingsApi.endpoints.listHoldings.initiate("a1"));
    expect(seen[0]?.url).toBe("/holdings");
    expect(seen[0]?.params).toBeUndefined();
    expect(seen[1]?.params).toEqual({ financial_account_id: "a1" });
  });

  it("adds, edits and removes a holding", async () => {
    const store = newStore();
    await store.dispatch(holdingsApi.endpoints.createHolding.initiate({
      financial_account_id: "a1", ticker_symbol: "VTI", name: null, security_type: "etf",
      quantity: "1.5", price: "250", cost_basis_cents: null,
    }));
    await store.dispatch(holdingsApi.endpoints.updateHolding.initiate({ holdingId: "h1", data: { price: "260" } }));
    await store.dispatch(holdingsApi.endpoints.deleteHolding.initiate("h1"));
    expect(seen.map((c) => [c.method, c.url])).toEqual([
      ["post", "/holdings"], ["patch", "/holdings/h1"], ["delete", "/holdings/h1"],
    ]);
    expect(JSON.parse(String(seen[0]?.data)).quantity).toBe("1.5");
    expect(JSON.parse(String(seen[1]?.data))).toEqual({ price: "260" });
  });
});
