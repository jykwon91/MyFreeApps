/**
 * undoDismissDiscoveredJob through the real endpoint with a fake axios adapter: it posts
 * undo-dismiss, refetches the inbox it invalidates, rethrows a refusal, and, since it runs
 * after its card has unmounted, leaves no mutation record in the store either way.
 */
import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { discoverApi } from "../store/discoverApi";
import { undoDismissDiscoveredJob } from "../store/undoDismissDiscoveredJob";

const sent: InternalAxiosRequestConfig[] = [];
let undoStatus = 204;

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

type Store = ReturnType<typeof makeStore>;

function mutationRecords(store: Store): unknown[] {
  return Object.values(store.getState()[baseApi.reducerPath].mutations);
}

function inboxRequests(): number {
  return sent.filter((config) => config.url === "/discover").length;
}

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    sent.push(config);
    if (config.url === "/discover") {
      const data = { items: [], total: 0, has_more: false, state: "inbox", scored_count: 0, total_count: 0 };
      return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
    }
    if (undoStatus >= 400) {
      const response = { status: undoStatus, data: { detail: "Discovery resource not found" }, statusText: "", headers: {}, config };
      return Promise.reject(Object.assign(new Error("failed"), { isAxiosError: true, config, response }));
    }
    return Promise.resolve({ data: undefined, status: undoStatus, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
  undoStatus = 204;
});

describe("undoDismissDiscoveredJob", () => {
  it("posts undo-dismiss, refetches the inbox, and leaves no mutation record", async () => {
    const store = makeStore();
    store.dispatch(discoverApi.endpoints.listDiscoveredJobsPages.initiate({ state: "inbox" }));
    await expect.poll(inboxRequests).toBe(1);

    await store.dispatch(undoDismissDiscoveredJob("j1"));

    expect(sent.some((config) => config.url === "/discover/j1/undo-dismiss" && config.method === "post")).toBe(true);
    await expect.poll(inboxRequests).toBe(2);
    expect(mutationRecords(store)).toEqual([]);
  });

  it("rethrows a refusal for the caller to show, still leaving no mutation record", async () => {
    undoStatus = 404;
    const store = makeStore();

    await expect(store.dispatch(undoDismissDiscoveredJob("j1"))).rejects.toMatchObject({
      status: 404,
      data: { detail: "Discovery resource not found" },
    });
    expect(mutationRecords(store)).toEqual([]);
  });
});
