import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../store/documentsApi";

const sent: InternalAxiosRequestConfig[] = [];
const EMPTY = { status: 200, data: { items: [], total: 0 } };
let respond: (config: InternalAxiosRequestConfig) => { status: number; data: unknown } = () => EMPTY;

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

type Initiate = {
  initiate: (arg?: unknown, options?: { direction?: "forward" | "backward" }) => Parameters<ReturnType<typeof makeStore>["dispatch"]>[0];
};
const endpoints = baseApi.endpoints as unknown as Record<string, Initiate>;

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
    return status < 400 ? Promise.resolve(response) : Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
  respond = () => EMPTY;
});

function doc(id: string, applicationId: string | null = null) {
  return {
    id,
    user_id: "u1",
    application_id: applicationId,
    title: id,
    kind: "cover_letter",
    body: "text",
    filename: null,
    content_type: null,
    size_bytes: null,
    has_file: false,
    deleted_at: null,
    created_at: "2026-10-21T00:00:00Z",
    updated_at: "2026-10-21T00:00:00Z",
  };
}

type ListPage = { items: { id: string }[]; total: number };
type ListState = { data?: { pages: ListPage[] } };

function listQueries(store: ReturnType<typeof makeStore>): ListState[] {
  const queries = (store.getState()[baseApi.reducerPath] as unknown as { queries: Record<string, ListState & { endpointName?: string }> }).queries;
  return Object.values(queries).filter((query) => query.endpointName === "listDocuments");
}

function listIds(store: ReturnType<typeof makeStore>): string[][] {
  return listQueries(store).map((query) => (query.data?.pages ?? []).flatMap((page) => page.items.map((item) => item.id)));
}

function listTotals(store: ReturnType<typeof makeStore>): number[][] {
  return listQueries(store).map((query) => (query.data?.pages ?? []).map((page) => page.total));
}

const page = (ids: string[], total: number) => ({ status: 200, data: { items: ids.map((id) => doc(id)), total } });

describe("documentsApi", () => {
  it("asks for the first page when no filter is given", async () => {
    await makeStore().dispatch(endpoints.listDocuments.initiate({}));
    expect(api.getUri(sent[0])).toBe("/api/documents?limit=50&offset=0");
  });

  it("leaves out empty filters", async () => {
    await makeStore().dispatch(endpoints.listDocuments.initiate({ application_id: "", kind: "" }));
    expect(api.getUri(sent[0])).toBe("/api/documents?limit=50&offset=0");
  });

  it("filters by application and kind", async () => {
    await makeStore().dispatch(endpoints.listDocuments.initiate({ application_id: "app-1", kind: "cover_letter" }));
    expect(api.getUri(sent[0])).toBe("/api/documents?application_id=app-1&kind=cover_letter&limit=50&offset=0");
  });

  it("loads the next page where the last one ended, keeping the kind filter", async () => {
    const store = makeStore();
    respond = (config) => (config.params.offset === 0 ? page(["d1", "d2"], 3) : page(["d3"], 3));
    await store.dispatch(endpoints.listDocuments.initiate({ kind: "cover_letter" }));
    await store.dispatch(endpoints.listDocuments.initiate({ kind: "cover_letter" }, { direction: "forward" }));

    expect(sent.map((config) => api.getUri(config))).toEqual([
      "/api/documents?kind=cover_letter&limit=50&offset=0",
      "/api/documents?kind=cover_letter&limit=50&offset=2",
    ]);
    expect(listIds(store)).toEqual([["d1", "d2", "d3"]]);
  });

  it("asks for no further page once every document is loaded", async () => {
    const store = makeStore();
    respond = () => page(["d1", "d2"], 2);
    await store.dispatch(endpoints.listDocuments.initiate({}));
    await store.dispatch(endpoints.listDocuments.initiate({}, { direction: "forward" }));
    expect(sent).toHaveLength(1);
  });

  it("posts the caller's form as-is", async () => {
    const form = new FormData();
    form.append("title", "Resume");
    await makeStore().dispatch(endpoints.uploadDocument.initiate(form));
    expect(sent[0].url).toBe("/documents/upload");
    expect(sent[0].method).toBe("post");
    expect(sent[0].data).toBe(form);
  });

  it("takes a deleted document out of every loaded list, even when the reload after it fails", async () => {
    const store = makeStore();
    respond = (config) =>
      config.params?.application_id ? { status: 200, data: { items: [doc("d1", "a1")], total: 1 } } : { status: 200, data: { items: [doc("d1", "a1"), doc("d2")], total: 2 } };
    await store.dispatch(endpoints.listDocuments.initiate({}));
    await store.dispatch(endpoints.listDocuments.initiate({ application_id: "a1" }));

    respond = (config) => (config.method === "delete" ? { status: 204, data: null } : { status: 503, data: { detail: "down" } });
    await store.dispatch(endpoints.deleteDocument.initiate("d1"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(listIds(store).sort()).toEqual([[], ["d2"]]);
    // The reloads were asked for, and failed.
    expect(sent.filter(({ method }) => method === "get").length).toBeGreaterThan(2);
  });

  it("takes a document deleted from a later page out of the list and lowers the total", async () => {
    const store = makeStore();
    respond = (config) => (config.params.offset === 0 ? page(["d1", "d2"], 4) : page(["d3", "d4"], 4));
    await store.dispatch(endpoints.listDocuments.initiate({}));
    await store.dispatch(endpoints.listDocuments.initiate({}, { direction: "forward" }));

    respond = (config) => (config.method === "delete" ? { status: 204, data: null } : { status: 503, data: { detail: "down" } });
    await store.dispatch(endpoints.deleteDocument.initiate("d4"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(listIds(store)).toEqual([["d1", "d2", "d3"]]);
    expect(listTotals(store)).toEqual([[3, 3]]);
  });

  it.each([
    ["creates", () => endpoints.createDocument.initiate({ title: "New", kind: "cover_letter", body: "text" })],
    ["uploads", () => endpoints.uploadDocument.initiate(new FormData())],
  ])("reloads both loaded pages and raises the total when a document is added (%s)", async (_name, add) => {
    const store = makeStore();
    let server = ["d1", "d2", "d3"];
    respond = (config) => {
      if (config.method === "post") return { status: 201, data: doc("new") };
      const offset = Number(config.params.offset);
      return page(server.slice(offset, offset + 2), server.length);
    };
    await store.dispatch(endpoints.listDocuments.initiate({}));
    await store.dispatch(endpoints.listDocuments.initiate({}, { direction: "forward" }));
    expect(listIds(store)).toEqual([["d1", "d2", "d3"]]);
    sent.length = 0;

    server = ["new", ...server];
    await store.dispatch(add());
    await new Promise((resolve) => setTimeout(resolve, 0));

    const reloads = sent.filter(({ method }) => method === "get").map((config) => config.params.offset);
    expect(reloads).toEqual([0, 2]);
    expect(listIds(store)).toEqual([["new", "d1", "d2", "d3"]]);
    expect(listTotals(store)).toEqual([[4, 4]]);
  });

  it("leaves the lists alone when the delete fails", async () => {
    const store = makeStore();
    respond = () => ({ status: 200, data: { items: [doc("d1"), doc("d2")], total: 2 } });
    await store.dispatch(endpoints.listDocuments.initiate({}));

    respond = (config) => (config.method === "delete" ? { status: 500, data: null } : { status: 200, data: { items: [doc("d1"), doc("d2")], total: 2 } });
    await store.dispatch(endpoints.deleteDocument.initiate("d1"));

    expect(listIds(store)).toEqual([["d1", "d2"]]);
  });
});
