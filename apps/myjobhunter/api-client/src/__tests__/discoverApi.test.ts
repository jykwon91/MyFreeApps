import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DISCOVER_CONFLICT_CODES } from "../constants/discoverConflictCodes";
import { discoverApi } from "../store/discoverApi";
import { undoDismissDiscoveredJob } from "../store/undoDismissDiscoveredJob";

const sent: InternalAxiosRequestConfig[] = [];
let respond: (config: InternalAxiosRequestConfig) => { status: number; data: unknown } = () => page([], 0);

function makeStore() {
  return configureStore({
    // discoverApi is baseApi with the Discovery tags, typed so its selectors read this store.
    reducer: { [discoverApi.reducerPath]: discoverApi.reducer },
    middleware: (getDefault) => getDefault().concat(discoverApi.middleware),
  });
}

type Initiate = {
  initiate: (arg?: unknown, options?: { direction?: "forward" | "backward" }) => Parameters<ReturnType<typeof makeStore>["dispatch"]>[0];
};
const endpoints = baseApi.endpoints as unknown as Record<string, Initiate>;

function page(ids: string[], total: number) {
  return { status: 200, data: { items: ids.map((id) => ({ id })), total, has_more: false, state: "inbox", scored_count: 0, total_count: total } };
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
    const { status, data } = respond(config);
    const response = { data, status, statusText: "", headers: {}, config };
    // As axios does: an error status rejects.
    if (status >= 400) return Promise.reject(new AxiosError("Request failed", undefined, config, undefined, response));
    return Promise.resolve(response);
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
  respond = () => page([], 0);
});

describe("listDiscoveredJobsPages", () => {
  it("asks for the first page of a view", async () => {
    await makeStore().dispatch(endpoints.listDiscoveredJobsPages.initiate({ state: "saved" }));
    expect(api.getUri(sent[0])).toBe("/api/discover?state=saved&limit=50&offset=0");
  });

  it("filters by saved search", async () => {
    await makeStore().dispatch(endpoints.listDiscoveredJobsPages.initiate({ state: "inbox", source_id: "s1" }));
    expect(api.getUri(sent[0])).toBe("/api/discover?state=inbox&source_id=s1&limit=50&offset=0");
  });

  it("loads the next page where the last one ended, and stops once all are loaded", async () => {
    const store = makeStore();
    respond = (config) => (config.params.offset === 0 ? page(["j1", "j2"], 3) : page(["j3"], 3));
    await store.dispatch(endpoints.listDiscoveredJobsPages.initiate({ state: "inbox" }));
    await store.dispatch(endpoints.listDiscoveredJobsPages.initiate({ state: "inbox" }, { direction: "forward" }));
    await store.dispatch(endpoints.listDiscoveredJobsPages.initiate({ state: "inbox" }, { direction: "forward" }));
    expect(sent.map((config) => api.getUri(config))).toEqual([
      "/api/discover?state=inbox&limit=50&offset=0",
      "/api/discover?state=inbox&limit=50&offset=2",
    ]);
  });
});

describe("moving a posting between the Inbox and Dismissed lists", () => {
  // A fake server holding which postings each view lists; dismiss and undo-dismiss move one across.
  let views: Record<string, string[]>;

  function serve(config: InternalAxiosRequestConfig): { status: number; data: unknown } {
    const move = /^\/discover\/(\w+)\/(dismiss|undo-dismiss)$/.exec(config.url ?? "");
    if (move) {
      const [, id, action] = move;
      const [from, to] = action === "dismiss" ? ["inbox", "dismissed"] : ["dismissed", "inbox"];
      // Like the backend: only a posting the source view lists can move (else 404).
      if (!views[from].includes(id)) return { status: 404, data: { detail: "Discovery resource not found" } };
      views[from] = views[from].filter((candidate) => candidate !== id);
      views[to] = [id, ...views[to]];
      return { status: 204, data: undefined };
    }
    const ids = views[config.params.state as string];
    return { status: 200, data: { ...page(ids, ids.length).data, state: config.params.state } };
  }

  function listed(store: ReturnType<typeof makeStore>, state: "inbox" | "dismissed"): string[] {
    const result = discoverApi.endpoints.listDiscoveredJobsPages.select({ state })(store.getState());
    return (result.data?.pages ?? []).flatMap((loaded) => loaded.items.map((job) => job.id));
  }

  async function openBothLists(): Promise<ReturnType<typeof makeStore>> {
    const store = makeStore();
    store.dispatch(discoverApi.endpoints.listDiscoveredJobsPages.initiate({ state: "inbox" }));
    store.dispatch(discoverApi.endpoints.listDiscoveredJobsPages.initiate({ state: "dismissed" }));
    await expect.poll(() => sent.length).toBe(2);
    return store;
  }

  beforeEach(() => {
    respond = serve;
  });

  it("refetches both lists on dismiss, so the posting leaves the inbox and shows under Dismissed", async () => {
    views = { inbox: ["j1", "j2"], dismissed: [] };
    const store = await openBothLists();
    await expect.poll(() => listed(store, "inbox")).toEqual(["j1", "j2"]);

    await store.dispatch(discoverApi.endpoints.dismissDiscoveredJob.initiate({ jobId: "j1" }));

    await expect.poll(() => listed(store, "inbox")).toEqual(["j2"]);
    await expect.poll(() => listed(store, "dismissed")).toEqual(["j1"]);
  });

  it("refetches both lists on restore, so the posting leaves Dismissed and returns to the inbox", async () => {
    views = { inbox: ["j2"], dismissed: ["j1"] };
    const store = await openBothLists();
    await expect.poll(() => listed(store, "dismissed")).toEqual(["j1"]);

    await store.dispatch(undoDismissDiscoveredJob("j1"));

    await expect.poll(() => listed(store, "dismissed")).toEqual([]);
    await expect.poll(() => listed(store, "inbox")).toEqual(["j1", "j2"]);
  });

  it("refetches the lists when Restore finds the posting already restored, so its card goes", async () => {
    views = { inbox: [], dismissed: ["j1"] };
    const store = await openBothLists();
    await expect.poll(() => listed(store, "dismissed")).toEqual(["j1"]);
    // Restored on another device: the server has moved it, this client's list still shows it.
    views = { inbox: ["j1"], dismissed: [] };

    await expect(store.dispatch(undoDismissDiscoveredJob("j1"))).rejects.toMatchObject({ status: 404 });

    await expect.poll(() => listed(store, "dismissed")).toEqual([]);
    await expect.poll(() => listed(store, "inbox")).toEqual(["j1"]);
  });

  it("refetches the lists when Dismiss is refused because the posting is already an application, so its card goes", async () => {
    views = { inbox: ["j1", "j2"], dismissed: [] };
    const store = await openBothLists();
    await expect.poll(() => listed(store, "inbox")).toEqual(["j1", "j2"]);
    // Added to Applications on another device: the server lists it nowhere and refuses Dismiss.
    views = { inbox: ["j2"], dismissed: [] };
    respond = (config) =>
      config.url === "/discover/j1/dismiss"
        ? { status: 409, data: { detail: { code: DISCOVER_CONFLICT_CODES.alreadyApplied, message: "This posting is already in your Applications" } } }
        : serve(config);

    const result = await store.dispatch(discoverApi.endpoints.dismissDiscoveredJob.initiate({ jobId: "j1" }));

    expect(result).toMatchObject({ error: { status: 409 } });
    await expect.poll(() => listed(store, "inbox")).toEqual(["j2"]);
    expect(listed(store, "dismissed")).toEqual([]);
  });
});
