import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { documentsApi } from "../store/documentsApi";
import { rentReceiptsApi } from "../store/rentReceiptsApi";
import { taxReturnsApi } from "../store/taxReturnsApi";
import { transactionsApi } from "../store/transactionsApi";

const PENDING_URL = "/rent-receipts/pending";
const TAX_RETURNS_URL = "/tax-returns";
const fetchCounts = new Map<string, number>();

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
    fetchCounts.set(config.url ?? "", (fetchCounts.get(config.url ?? "") ?? 0) + 1);
    const data = config.url === PENDING_URL ? { items: [], total: 0 } : config.url === TAX_RETURNS_URL ? [] : {};
    return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  fetchCounts.clear();
});

async function refetchesList(
  url: string,
  mutate: (store: ReturnType<typeof makeStore>) => Promise<unknown>,
): Promise<number> {
  const store = makeStore();
  const subscription = url === PENDING_URL
    ? store.dispatch(rentReceiptsApi.endpoints.getPendingReceipts.initiate())
    : store.dispatch(taxReturnsApi.endpoints.listTaxReturns.initiate());
  await subscription;
  await mutate(store);
  await new Promise((resolve) => setTimeout(resolve, 0));
  subscription.unsubscribe();
  return fetchCounts.get(url) ?? 0;
}

describe("deleting payments refreshes the pending receipts list and badge", () => {
  it("single delete", async () => {
    const fetches = await refetchesList(PENDING_URL, (store) =>
      store.dispatch(transactionsApi.endpoints.deleteTransaction.initiate("t1")));
    expect(fetches).toBe(2);
  });

  it("bulk delete", async () => {
    const fetches = await refetchesList(PENDING_URL, (store) =>
      store.dispatch(transactionsApi.endpoints.bulkDeleteTransactions.initiate(["t1", "t2"])));
    expect(fetches).toBe(2);
  });

  it("keeping one duplicate", async () => {
    const fetches = await refetchesList(PENDING_URL, (store) =>
      store.dispatch(transactionsApi.endpoints.keepDuplicate.initiate({ keep_id: "t1", delete_ids: ["t2"] })));
    expect(fetches).toBe(2);
  });

  it("merging duplicates", async () => {
    const fetches = await refetchesList(PENDING_URL, (store) =>
      store.dispatch(transactionsApi.endpoints.mergeDuplicates.initiate({
        transaction_a_id: "t1", transaction_b_id: "t2", surviving_id: "t1", field_overrides: {},
      })));
    expect(fetches).toBe(2);
  });

  it("deleting a document", async () => {
    const fetches = await refetchesList(PENDING_URL, (store) =>
      store.dispatch(documentsApi.endpoints.deleteDocument.initiate("d1")));
    expect(fetches).toBe(2);
  });

  it("marking a document reference-only", async () => {
    const fetches = await refetchesList(PENDING_URL, (store) =>
      store.dispatch(documentsApi.endpoints.toggleEscrowPaid.initiate({ id: "d1", is_escrow_paid: true })));
    expect(fetches).toBe(2);
  });
});

describe("removing a document's payments refreshes the tax returns (Needs recompute banner)", () => {
  it("deleting a document", async () => {
    const fetches = await refetchesList(TAX_RETURNS_URL, (store) =>
      store.dispatch(documentsApi.endpoints.deleteDocument.initiate("d1")));
    expect(fetches).toBe(2);
  });

  it("marking a document reference-only", async () => {
    const fetches = await refetchesList(TAX_RETURNS_URL, (store) =>
      store.dispatch(documentsApi.endpoints.toggleEscrowPaid.initiate({ id: "d1", is_escrow_paid: true })));
    expect(fetches).toBe(2);
  });
});
