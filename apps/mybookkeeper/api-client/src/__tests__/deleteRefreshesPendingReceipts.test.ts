import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { documentsApi } from "../store/documentsApi";
import { rentReceiptsApi } from "../store/rentReceiptsApi";
import { transactionsApi } from "../store/transactionsApi";

const PENDING_URL = "/rent-receipts/pending";
let pendingFetches = 0;

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
    if (config.url === PENDING_URL) pendingFetches += 1;
    const data = config.url === PENDING_URL ? { items: [], total: 0 } : {};
    return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  pendingFetches = 0;
});

async function refetchesPendingReceipts(
  mutate: (store: ReturnType<typeof makeStore>) => Promise<unknown>,
): Promise<number> {
  const store = makeStore();
  const subscription = store.dispatch(rentReceiptsApi.endpoints.getPendingReceipts.initiate());
  await subscription;
  await mutate(store);
  await new Promise((resolve) => setTimeout(resolve, 0));
  subscription.unsubscribe();
  return pendingFetches;
}

describe("deleting payments refreshes the pending receipts list and badge", () => {
  it("single delete", async () => {
    const fetches = await refetchesPendingReceipts((store) =>
      store.dispatch(transactionsApi.endpoints.deleteTransaction.initiate("t1")));
    expect(fetches).toBe(2);
  });

  it("bulk delete", async () => {
    const fetches = await refetchesPendingReceipts((store) =>
      store.dispatch(transactionsApi.endpoints.bulkDeleteTransactions.initiate(["t1", "t2"])));
    expect(fetches).toBe(2);
  });

  it("keeping one duplicate", async () => {
    const fetches = await refetchesPendingReceipts((store) =>
      store.dispatch(transactionsApi.endpoints.keepDuplicate.initiate({ keep_id: "t1", delete_ids: ["t2"] })));
    expect(fetches).toBe(2);
  });

  it("merging duplicates", async () => {
    const fetches = await refetchesPendingReceipts((store) =>
      store.dispatch(transactionsApi.endpoints.mergeDuplicates.initiate({
        transaction_a_id: "t1", transaction_b_id: "t2", surviving_id: "t1", field_overrides: {},
      })));
    expect(fetches).toBe(2);
  });

  it("deleting a document", async () => {
    const fetches = await refetchesPendingReceipts((store) =>
      store.dispatch(documentsApi.endpoints.deleteDocument.initiate("d1")));
    expect(fetches).toBe(2);
  });
});
