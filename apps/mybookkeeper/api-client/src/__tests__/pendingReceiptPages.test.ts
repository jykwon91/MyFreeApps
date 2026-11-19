import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PENDING_RECEIPT_PAGE_SIZE } from "../constants/receiptPaging";
import { rentReceiptsApi } from "../store/rentReceiptsApi";

const PENDING_URL = "/rent-receipts/pending";
const ROW_COUNT = PENDING_RECEIPT_PAGE_SIZE + 4;
const ids = Array.from({ length: ROW_COUNT }, (_, index) => `tx${index + 1}`);
let reads: AxiosRequestConfig[] = [];

function receipt(transactionId: string) {
  return { id: `r-${transactionId}`, transaction_id: transactionId };
}

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
    const url = config.url ?? "";
    const answer = (data: unknown) => Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
    if (url === PENDING_URL) {
      reads.push(config);
      const { limit, offset } = config.params as { limit: number; offset: number };
      const items = ids.slice(offset, offset + limit).map(receipt);
      return answer({ items, total: ROW_COUNT, has_more: offset + items.length < ROW_COUNT, pending_count: ROW_COUNT, gmail_state: "ready" });
    }
    if (url.startsWith(`${PENDING_URL}/`)) {
      reads.push(config);
      return answer({ item: receipt(url.slice(PENDING_URL.length + 1)), gmail_state: "needs_reconnect" });
    }
    return answer({ receipt_number: "R-1", attachment_id: "a1" });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  reads = [];
});

describe("pending receipt pages", () => {
  it("asks a page at a time by offset, and stops after the page that says there's no more", async () => {
    const store = makeStore();
    const list = store.dispatch(rentReceiptsApi.endpoints.listPendingReceiptPages.initiate());
    await list;
    const next = await store.dispatch(rentReceiptsApi.endpoints.listPendingReceiptPages.initiate(undefined, { direction: "forward" }));

    const loaded = next.data?.pages.flatMap((page) => page.items.map((item) => item.transaction_id)) ?? [];
    expect(loaded).toEqual(ids);
    expect(next.hasNextPage).toBe(false);
    expect(reads.map((read) => read.params)).toEqual([
      { limit: PENDING_RECEIPT_PAGE_SIZE, offset: 0 },
      { limit: PENDING_RECEIPT_PAGE_SIZE, offset: PENDING_RECEIPT_PAGE_SIZE },
    ]);
    list.unsubscribe();
  });

  it("looks one receipt up by its payment, and a send refreshes that lookup", async () => {
    const store = makeStore();
    const lookup = store.dispatch(rentReceiptsApi.endpoints.getPendingReceipt.initiate(`tx${ROW_COUNT}`));
    const { data } = await lookup;

    expect(data?.item?.transaction_id).toBe(`tx${ROW_COUNT}`);
    expect(data?.gmail_state).toBe("needs_reconnect");
    expect(reads.map((read) => read.url)).toEqual([`${PENDING_URL}/tx${ROW_COUNT}`]);

    await store.dispatch(rentReceiptsApi.endpoints.sendReceipt.initiate({
      transaction_id: `tx${ROW_COUNT}`,
      data: { period_start: "2026-05-01", period_end: "2026-05-31", payment_method: null },
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(reads).toHaveLength(2);
    lookup.unsubscribe();
  });
});
