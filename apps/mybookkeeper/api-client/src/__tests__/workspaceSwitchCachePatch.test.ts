import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../store/inquiriesApi";

let workspace = "A";

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

type Store = ReturnType<typeof makeStore>;
type Initiate = { initiate: (arg?: unknown, options?: { forceRefetch: boolean }) => Parameters<Store["dispatch"]>[0] };
const endpoints = baseApi.endpoints as unknown as Record<string, Initiate>;
const originalAdapter = api.defaults.adapter;

/**
 * Answers each read once from `lists`, keyed by workspace; a refetch after that never lands, so the
 * cache shows what the save did. Holds each write until `release` is called.
 */
function serve(lists: Record<string, unknown>) {
  const held: Array<() => void> = [];
  const adapter: AxiosAdapter = (config: InternalAxiosRequestConfig) => {
    const reply = (data: unknown): AxiosResponse => ({ data, status: 200, statusText: "", headers: {}, config });
    const sentTo = String(config.headers["X-Organization-Id"]);
    if (config.method === "get") {
      const key = `${sentTo} ${config.url}`;
      if (!(key in lists)) return new Promise(() => {});
      const list = lists[key];
      delete lists[key];
      return Promise.resolve(reply(list));
    }
    return new Promise((resolve) => held.push(() => resolve(reply(JSON.parse(String(config.data))))));
  };
  api.defaults.adapter = adapter;
  return { release: () => held.shift()?.() };
}

function cached(store: Store, key: string): unknown {
  return store.getState()[baseApi.reducerPath].queries[key]?.data;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  workspace = "A";
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => workspace },
    isOnLogin: () => false,
  });
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("a save that lands after the workspace changed", () => {
  const theirs = { id: "b1", name: "B's template", display_order: 0, is_archived: false };
  const mine = { id: "a1", name: "A's template", display_order: 0, is_archived: false };

  // The cache isn't keyed by workspace. A switch here resets it, which aborts the save; on the
  // website another tab can change the stored workspace without that, and the list reloads as B's.
  it("leaves the new workspace's templates as the server sent them", async () => {
    const server = serve({ "A /reply-templates": [], "B /reply-templates": [theirs] });
    const store = makeStore();
    await store.dispatch(endpoints.getReplyTemplates.initiate());
    const saving = store.dispatch(endpoints.updateReplyTemplate.initiate({ id: "a1", data: mine }));
    await flush();

    workspace = "B";
    await store.dispatch(endpoints.getReplyTemplates.initiate(undefined, { forceRefetch: true }));
    expect(cached(store, "getReplyTemplates(undefined)")).toEqual([theirs]);
    server.release();
    await saving;

    expect(cached(store, "getReplyTemplates(undefined)")).toEqual([theirs]);
  });

  it("isn't saved at all when a switch resets the cache", async () => {
    serve({ "A /reply-templates": [] });
    const store = makeStore();
    await store.dispatch(endpoints.getReplyTemplates.initiate());
    const saving = store.dispatch(endpoints.updateReplyTemplate.initiate({ id: "a1", data: mine }));
    await flush();

    workspace = "B";
    store.dispatch(baseApi.util.resetApiState());

    expect(await saving).toMatchObject({ error: { name: "AbortError" } });
  });

  it("still shows the save at once when the workspace is unchanged", async () => {
    const server = serve({ "A /reply-templates": [] });
    const store = makeStore();
    await store.dispatch(endpoints.getReplyTemplates.initiate());
    const saving = store.dispatch(endpoints.updateReplyTemplate.initiate({ id: "a1", data: mine }));
    await flush();
    server.release();
    await saving;

    expect(cached(store, "getReplyTemplates(undefined)")).toEqual([mine]);
  });
});
