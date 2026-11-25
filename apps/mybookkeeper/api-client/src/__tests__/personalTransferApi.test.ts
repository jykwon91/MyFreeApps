import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { attributionApi } from "../store/attributionApi";
import { personalTransferApi } from "../store/personalTransferApi";
import { transactionsApi } from "../store/transactionsApi";

const sent: InternalAxiosRequestConfig[] = [];
const QUEUE = {
  items: [
    { id: "r1", transaction_id: "t1" },
    { id: "r2", transaction_id: "t2" },
  ],
  total: 2,
  pending_count: 2,
};
const SENDERS = [
  { id: "s1", display_name: "Dao Nguyen", payer_handle: "" },
  { id: "s2", display_name: "Kim Tran", payer_handle: "kim@example.com" },
];

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

type Store = ReturnType<typeof makeStore>;
const queueSelector = attributionApi.endpoints.getAttributionReviewQueue.select();
const sendersSelector = personalTransferApi.endpoints.getPersonalTransferSenders.select();

// The store holds the one shared api reducer; each endpoint's selector is typed for its own slice of tags.
function queueIn(store: Store) {
  return queueSelector(store.getState() as Parameters<typeof queueSelector>[0]).data;
}

function sendersIn(store: Store) {
  return sendersSelector(store.getState() as Parameters<typeof sendersSelector>[0]).data;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
let holdQueueRefetch = false;

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => "w1" },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    sent.push(config);
    const url = config.url ?? "";
    if (url.includes("review-queue")) {
      if (holdQueueRefetch && sent.filter((c) => c.url?.includes("review-queue")).length > 1) {
        return new Promise(() => {});
      }
      return Promise.resolve({ data: structuredClone(QUEUE), status: 200, statusText: "", headers: {}, config });
    }
    const data = url === "/personal-transfer-senders"
      ? structuredClone(SENDERS)
      : url === "/transactions/review-count"
        ? { count: 0 }
        : { transaction_id: "t1", remembered_sender: SENDERS[0], also_cleared: 0 };
    return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
  holdQueueRefetch = false;
});

describe("markPersonalTransfer", () => {
  it("PUTs the mark and takes the payment's card off Payment Review straight away", async () => {
    holdQueueRefetch = true;
    const store = makeStore();
    store.dispatch(attributionApi.endpoints.getAttributionReviewQueue.initiate());
    await settle();

    const result = await store.dispatch(personalTransferApi.endpoints.markPersonalTransfer.initiate("t1"));
    await settle();

    expect(result.data?.remembered_sender?.display_name).toBe("Dao Nguyen");
    expect(sent.some((c) => c.method === "put" && c.url === "/transactions/t1/personal-transfer")).toBe(true);
    const queue = queueIn(store);
    expect(queue?.items.map((item) => item.id)).toEqual(["r2"]);
    expect(queue?.pending_count).toBe(1);
  });

  it("refreshes the review count and the remembered senders", async () => {
    const store = makeStore();
    store.dispatch(transactionsApi.endpoints.getTransactionReviewCount.initiate());
    store.dispatch(personalTransferApi.endpoints.getPersonalTransferSenders.initiate());
    await settle();
    sent.length = 0;
    await store.dispatch(personalTransferApi.endpoints.markPersonalTransfer.initiate("t1"));
    await settle();
    const urls = sent.map((c) => c.url);
    expect(urls).toContain("/transactions/review-count");
    expect(urls).toContain("/personal-transfer-senders");
  });
});

describe("unmarkPersonalTransfer", () => {
  it("POSTs the undo with whether to forget the sender", async () => {
    const store = makeStore();
    await store.dispatch(
      personalTransferApi.endpoints.unmarkPersonalTransfer.initiate({ transaction_id: "t1", forget_sender: true }),
    );
    const call = sent.find((c) => c.url === "/transactions/t1/personal-transfer/undo");
    expect(call?.method).toBe("post");
    expect(JSON.parse(call?.data as string)).toEqual({ forget_sender: true });
  });
});

describe("forgetPersonalTransferSender", () => {
  it("DELETEs the sender and drops it from the list", async () => {
    const store = makeStore();
    store.dispatch(personalTransferApi.endpoints.getPersonalTransferSenders.initiate());
    await settle();
    await store.dispatch(personalTransferApi.endpoints.forgetPersonalTransferSender.initiate("s1"));
    expect(sent.some((c) => c.method === "delete" && c.url === "/personal-transfer-senders/s1")).toBe(true);
    const senders = sendersIn(store);
    expect(senders?.map((s) => s.id)).toEqual(["s2"]);
  });
});
