import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { plaidApi } from "../store/plaidApi";

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
    return Promise.resolve({ data: [], status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  seen = [];
});

describe("plaidApi", () => {
  it("calls each bank-connection route", async () => {
    const store = newStore();
    await store.dispatch(plaidApi.endpoints.createPlaidLinkToken.initiate({ item_id: "i1" }));
    await store.dispatch(plaidApi.endpoints.connectPlaidItem.initiate({
      public_token: "public-1", institution_id: "ins_3", institution_name: "Chase",
      accounts: [{ plaid_account_id: "p1", financial_account_id: null, default_transaction_scope: "personal" }],
    }));
    await store.dispatch(plaidApi.endpoints.syncPlaidItem.initiate("i1"));
    await store.dispatch(plaidApi.endpoints.markPlaidItemReconnected.initiate("i1"));
    await store.dispatch(plaidApi.endpoints.disconnectPlaidItem.initiate("i1"));
    expect(seen.map((c) => [c.method, c.url])).toEqual([
      ["post", "/plaid/link-token"],
      ["post", "/plaid/items"],
      ["post", "/plaid/items/i1/sync"],
      ["post", "/plaid/items/i1/reconnected"],
      ["delete", "/plaid/items/i1"],
    ]);
    expect(JSON.parse(String(seen[0].data))).toEqual({ item_id: "i1" });
  });

  it("lists connections", async () => {
    const store = newStore();
    await store.dispatch(plaidApi.endpoints.listPlaidItems.initiate());
    expect(seen.map((c) => [c.method, c.url])).toEqual([["get", "/plaid/items"]]);
  });
});
