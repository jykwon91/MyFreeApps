import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { financialAccountsApi } from "../store/financialAccountsApi";
import { transactionsApi } from "../store/transactionsApi";

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
    return Promise.resolve({ data: { items: [], totals: [] }, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  seen = [];
});

describe("financialAccountsApi", () => {
  it("creates, changes, deletes and restores", async () => {
    const store = newStore();
    await store.dispatch(financialAccountsApi.endpoints.createFinancialAccount.initiate({ name: "Chase", account_type: "checking" }));
    await store.dispatch(financialAccountsApi.endpoints.updateFinancialAccount.initiate({ accountId: "a1", data: { closed_on: null } }));
    await store.dispatch(financialAccountsApi.endpoints.deleteFinancialAccount.initiate("a1"));
    await store.dispatch(financialAccountsApi.endpoints.restoreFinancialAccount.initiate("a1"));
    expect(seen.map((c) => [c.method, c.url])).toEqual([
      ["post", "/financial-accounts"],
      ["patch", "/financial-accounts/a1"],
      ["delete", "/financial-accounts/a1"],
      ["post", "/financial-accounts/a1/restore"],
    ]);
    // Reopening is an explicit null, which must reach the server.
    expect(JSON.parse(String(seen[1].data))).toEqual({ closed_on: null });
  });
});

describe("bank CSV import", () => {
  it("sends the chosen account and property, and nothing when neither is chosen", async () => {
    const store = newStore();
    await store.dispatch(transactionsApi.endpoints.importBankCsv.initiate({ form: new FormData(), accountId: "a1" }));
    await store.dispatch(transactionsApi.endpoints.importBankCsv.initiate({ form: new FormData(), propertyId: "p1", accountId: "a1" }));
    await store.dispatch(transactionsApi.endpoints.importBankCsv.initiate({ form: new FormData() }));
    expect(seen.map((c) => c.params)).toEqual([
      { account_id: "a1" },
      { property_id: "p1", account_id: "a1" },
      undefined,
    ]);
  });
});
