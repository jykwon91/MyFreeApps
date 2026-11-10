/**
 * Unit tests for the applicationsApi RTK Query slice, driven through the real
 * endpoints with a fake axios adapter.
 *
 * Fix 1 — logApplicationEvent cache invalidation (audit 2026-05-02):
 *   After logging an event, every view that shows the application's status
 *   must refetch: its events list, the application itself, the /applications
 *   list and the kanban board. Otherwise the status badge stays stale.
 *
 * Fix 2 — listApplications company_id filter:
 *   When called with { company_id }, the request must carry the company_id
 *   param. With no arg, undefined or an empty string, no param is sent.
 */
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../store/applicationsApi";

const sent: InternalAxiosRequestConfig[] = [];

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

type Store = ReturnType<typeof makeStore>;
type Initiate = { initiate: (arg?: unknown) => Parameters<Store["dispatch"]>[0] };
const endpoints = baseApi.endpoints as unknown as Record<string, Initiate>;

async function settle(store: Store) {
  await Promise.all(store.dispatch(baseApi.util.getRunningQueriesThunk()));
}

function getsTo(uri: string): number {
  return sent.filter((config) => config.method === "get" && api.getUri(config) === uri).length;
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
    return Promise.resolve({ data: { items: [], total: 0 }, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
});

describe("logApplicationEvent invalidation", () => {
  it("refetches the events, the application, the list and the kanban board", async () => {
    const store = makeStore();
    store.dispatch(endpoints.listApplications.initiate());
    store.dispatch(endpoints.listApplicationsKanban.initiate());
    store.dispatch(endpoints.getApplication.initiate("app-1"));
    store.dispatch(endpoints.listApplicationEvents.initiate("app-1"));
    await settle(store);
    sent.length = 0;

    await store.dispatch(
      endpoints.logApplicationEvent.initiate({ applicationId: "app-1", body: { event_type: "note_added" } }),
    );
    await settle(store);

    expect(sent.filter((config) => config.method === "post").map((config) => config.url)).toEqual([
      "/applications/app-1/events",
    ]);
    expect(getsTo("/api/applications")).toBe(1);
    expect(getsTo("/api/applications?view=kanban")).toBe(1);
    expect(getsTo("/api/applications/app-1")).toBe(1);
    expect(getsTo("/api/applications/app-1/events")).toBe(1);
  });

  it("leaves another application's cached views alone", async () => {
    const store = makeStore();
    store.dispatch(endpoints.getApplication.initiate("app-2"));
    store.dispatch(endpoints.listApplicationEvents.initiate("app-2"));
    await settle(store);
    sent.length = 0;

    await store.dispatch(
      endpoints.logApplicationEvent.initiate({ applicationId: "app-1", body: { event_type: "note_added" } }),
    );
    await settle(store);

    expect(getsTo("/api/applications/app-2")).toBe(0);
    expect(getsTo("/api/applications/app-2/events")).toBe(0);
  });
});

describe("listApplications request", () => {
  it("sends no company_id with no filter arg", async () => {
    await makeStore().dispatch(endpoints.listApplications.initiate());
    expect(sent[0].url).toBe("/applications");
    expect(api.getUri(sent[0])).toBe("/api/applications");
  });

  it("sends no company_id with an empty filter object", async () => {
    await makeStore().dispatch(endpoints.listApplications.initiate({}));
    expect(api.getUri(sent[0])).toBe("/api/applications");
  });

  it("sends no company_id when it is undefined in the filter object", async () => {
    await makeStore().dispatch(endpoints.listApplications.initiate({ company_id: undefined }));
    expect(api.getUri(sent[0])).toBe("/api/applications");
  });

  it("sends no company_id when it is an empty string", async () => {
    await makeStore().dispatch(endpoints.listApplications.initiate({ company_id: "" }));
    expect(api.getUri(sent[0])).toBe("/api/applications");
  });

  it("sends ?company_id= when company_id is provided", async () => {
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    await makeStore().dispatch(endpoints.listApplications.initiate({ company_id: id }));
    expect(api.getUri(sent[0])).toBe(`/api/applications?company_id=${id}`);
  });
});
