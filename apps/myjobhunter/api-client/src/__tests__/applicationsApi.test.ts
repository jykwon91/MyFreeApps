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
 *   param. With no company_id, undefined or an empty string, no param is sent.
 *
 * Paging — listApplications is an infinite query: each page asks for the
 * server's sort and the next offset, and stops once `total` rows are loaded.
 */
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { APPLICATIONS_PAGE_SIZE, DEFAULT_APPLICATIONS_SORT } from "../constants/applicationsPaging";
import "../store/applicationsApi";
import type { Application } from "../types/application";
import type { ApplicationListResponse } from "../types/application-list-response";
import type { ApplicationsListQuery } from "../types/application/applications-list-query";
import { flattenApplicationPages } from "../utils/flattenApplicationPages";

const sent: InternalAxiosRequestConfig[] = [];
const EMPTY_LIST: ApplicationListResponse = { items: [], total: 0 };
let listReply: (config: InternalAxiosRequestConfig) => ApplicationListResponse = () => EMPTY_LIST;
const DEFAULT_QUERY: ApplicationsListQuery = { ...DEFAULT_APPLICATIONS_SORT };
const LIST_URI = `/api/applications?sort=applied&order=desc&limit=${APPLICATIONS_PAGE_SIZE}&offset=0`;

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

type Store = ReturnType<typeof makeStore>;
type Initiate = {
  initiate: (arg?: unknown, options?: { direction?: "forward" | "backward" }) => Parameters<Store["dispatch"]>[0];
  select: (arg: unknown) => (state: ReturnType<Store["getState"]>) => {
    data?: { pages: ApplicationListResponse[] };
    hasNextPage: boolean;
  };
};
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
    const data = config.url === "/applications" ? listReply(config) : EMPTY_LIST;
    return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
  listReply = () => EMPTY_LIST;
});

describe("logApplicationEvent invalidation", () => {
  it("refetches the events, the application, the list and the kanban board", async () => {
    const store = makeStore();
    store.dispatch(endpoints.listApplications.initiate(DEFAULT_QUERY));
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
    expect(getsTo(LIST_URI)).toBe(1);
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
  it("asks for the first page in the requested sort, with no company_id when none is given", async () => {
    await makeStore().dispatch(endpoints.listApplications.initiate(DEFAULT_QUERY));
    expect(sent[0].url).toBe("/applications");
    expect(api.getUri(sent[0])).toBe(LIST_URI);
  });

  it("sends no company_id when it is undefined or an empty string", async () => {
    await makeStore().dispatch(endpoints.listApplications.initiate({ ...DEFAULT_QUERY, company_id: undefined }));
    await makeStore().dispatch(endpoints.listApplications.initiate({ ...DEFAULT_QUERY, company_id: "" }));
    expect(sent.map((config) => api.getUri(config))).toEqual([LIST_URI, LIST_URI]);
  });

  it("sends ?company_id= and the chosen sort", async () => {
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    await makeStore().dispatch(endpoints.listApplications.initiate({ company_id: id, sort: "status", order: "asc" }));
    expect(api.getUri(sent[0])).toBe(
      `/api/applications?company_id=${id}&sort=status&order=asc&limit=${APPLICATIONS_PAGE_SIZE}&offset=0`,
    );
  });
});

describe("listApplications paging", () => {
  const TOTAL = APPLICATIONS_PAGE_SIZE * 2 + 3;
  const all: Application[] = Array.from({ length: TOTAL }, (_, i) => ({ id: `app-${i}` }) as Application);

  function servePages(): void {
    listReply = (config) => {
      const params = config.params as { offset: number; limit: number };
      return { items: all.slice(params.offset, params.offset + params.limit), total: TOTAL };
    };
  }

  it("loads the next page from where the last one ended, until every row is loaded", async () => {
    servePages();
    const store = makeStore();
    const select = endpoints.listApplications.select(DEFAULT_QUERY);

    await store.dispatch(endpoints.listApplications.initiate(DEFAULT_QUERY));
    expect(select(store.getState()).hasNextPage).toBe(true);
    await store.dispatch(endpoints.listApplications.initiate(DEFAULT_QUERY, { direction: "forward" }));
    await store.dispatch(endpoints.listApplications.initiate(DEFAULT_QUERY, { direction: "forward" }));

    const state = select(store.getState());
    expect(sent.map((config) => (config.params as { offset: number }).offset)).toEqual([
      0,
      APPLICATIONS_PAGE_SIZE,
      APPLICATIONS_PAGE_SIZE * 2,
    ]);
    expect(flattenApplicationPages(state.data?.pages).map(({ id }) => id)).toEqual(all.map(({ id }) => id));
    expect(state.hasNextPage).toBe(false);
  });

  it("has no next page when the first page holds every row", async () => {
    listReply = () => ({ items: all.slice(0, 2), total: 2 });
    const store = makeStore();
    await store.dispatch(endpoints.listApplications.initiate(DEFAULT_QUERY));
    expect(endpoints.listApplications.select(DEFAULT_QUERY)(store.getState()).hasNextPage).toBe(false);
  });

  it("keeps each sort in its own cache entry, starting from the first page", async () => {
    servePages();
    const store = makeStore();
    const byCompany: ApplicationsListQuery = { sort: "company", order: "asc" };
    await store.dispatch(endpoints.listApplications.initiate(DEFAULT_QUERY));
    await store.dispatch(endpoints.listApplications.initiate(DEFAULT_QUERY, { direction: "forward" }));
    await store.dispatch(endpoints.listApplications.initiate(byCompany));

    expect(api.getUri(sent[2])).toBe(`/api/applications?sort=company&order=asc&limit=${APPLICATIONS_PAGE_SIZE}&offset=0`);
    expect(endpoints.listApplications.select(byCompany)(store.getState()).data?.pages).toHaveLength(1);
    expect(endpoints.listApplications.select(DEFAULT_QUERY)(store.getState()).data?.pages).toHaveLength(2);
  });
});
