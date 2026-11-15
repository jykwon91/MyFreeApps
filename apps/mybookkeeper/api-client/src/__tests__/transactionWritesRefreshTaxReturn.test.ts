import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { attributionApi } from "../store/attributionApi";
import { documentsApi } from "../store/documentsApi";
import { taxReturnsApi } from "../store/taxReturnsApi";
import { transactionsApi } from "../store/transactionsApi";

const RETURN_URL = "/tax-returns/r1";
let returnFetches = 0;

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
    if (config.url === RETURN_URL) returnFetches += 1;
    const data = config.url === RETURN_URL ? { id: "r1", needs_recompute: true } : { ok: true, transaction_id: "t1" };
    return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  returnFetches = 0;
});

async function returnFetchesAfter(
  mutate: (store: ReturnType<typeof makeStore>) => Promise<unknown>,
): Promise<number> {
  const store = makeStore();
  const subscription = store.dispatch(taxReturnsApi.endpoints.getTaxReturn.initiate("r1"));
  await subscription;
  await mutate(store);
  await new Promise((resolve) => setTimeout(resolve, 0));
  subscription.unsubscribe();
  return returnFetches;
}

describe("writes that can move Schedule E refetch the open tax return", () => {
  it.each([
    ["editing a transaction", (store: ReturnType<typeof makeStore>) =>
      store.dispatch(transactionsApi.endpoints.updateTransaction.initiate({ id: "t1", data: { amount: "250.00" } }))],
    ["deleting a transaction", (store: ReturnType<typeof makeStore>) =>
      store.dispatch(transactionsApi.endpoints.deleteTransaction.initiate("t1"))],
    ["bulk approving", (store: ReturnType<typeof makeStore>) =>
      store.dispatch(transactionsApi.endpoints.bulkApproveTransactions.initiate(["t1"]))],
    ["bulk deleting", (store: ReturnType<typeof makeStore>) =>
      store.dispatch(transactionsApi.endpoints.bulkDeleteTransactions.initiate(["t1"]))],
    ["keeping one duplicate", (store: ReturnType<typeof makeStore>) =>
      store.dispatch(transactionsApi.endpoints.keepDuplicate.initiate({ keep_id: "t1", delete_ids: ["t2"] }))],
    ["merging duplicates", (store: ReturnType<typeof makeStore>) =>
      store.dispatch(transactionsApi.endpoints.mergeDuplicates.initiate({
        transaction_a_id: "t1", transaction_b_id: "t2", surviving_id: "t1", field_overrides: {},
      }))],
    ["importing a bank CSV", (store: ReturnType<typeof makeStore>) =>
      store.dispatch(transactionsApi.endpoints.importBankCsv.initiate({ form: new FormData() }))],
    ["confirming an attribution", (store: ReturnType<typeof makeStore>) =>
      store.dispatch(attributionApi.endpoints.confirmAttributionReview.initiate({ review_id: "q1", applicant_id: "a1" }))],
    ["linking a payment to a tenant", (store: ReturnType<typeof makeStore>) =>
      store.dispatch(attributionApi.endpoints.attributeTransactionManually.initiate({ transaction_id: "t1", applicant_id: "a1" }))],
    ["deleting a document", (store: ReturnType<typeof makeStore>) =>
      store.dispatch(documentsApi.endpoints.deleteDocument.initiate("d1"))],
    ["bulk deleting documents", (store: ReturnType<typeof makeStore>) =>
      store.dispatch(documentsApi.endpoints.bulkDeleteDocuments.initiate(["d1"]))],
  ])("%s", async (_name, mutate) => {
    expect(await returnFetchesAfter(mutate)).toBe(2);
  });

  it("dismissing a duplicate pair leaves the return alone", async () => {
    const fetches = await returnFetchesAfter((store) =>
      store.dispatch(transactionsApi.endpoints.dismissDuplicate.initiate({ transaction_ids: ["t1", "t2"] })));
    expect(fetches).toBe(1);
  });
});
