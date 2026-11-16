/**
 * Editing an event through the real slice with a fake axios adapter: the application
 * detail embeds its events, so after the edit it refetches and shows the new note.
 * The list and kanban board (latest event type and time only) are left alone.
 */
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../store/applicationsApi";

const sent: InternalAxiosRequestConfig[] = [];
let storedNote = "old note";

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

type Store = ReturnType<typeof makeStore>;
type Endpoint = {
  initiate: (arg?: unknown) => Parameters<Store["dispatch"]>[0];
  select: (arg: unknown) => (state: ReturnType<Store["getState"]>) => { data?: { events: { note: string }[] } };
};
const endpoints = baseApi.endpoints as unknown as Record<string, Endpoint>;

async function settle(store: Store) {
  await Promise.all(store.dispatch(baseApi.util.getRunningQueriesThunk()));
}

const getsTo = (uri: string): number =>
  sent.filter((config) => config.method === "get" && api.getUri(config) === uri).length;

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    sent.push(config);
    if (config.method === "patch") storedNote = JSON.parse(String(config.data)).note;
    const isDetail = config.method === "get" && /^\/applications\/app-\d$/.test(config.url ?? "");
    const data = isDetail
      ? { events: [{ id: "e-1", note: storedNote }], contacts: [] }
      : config.method === "get"
        ? { items: [], total: 0 }
        : {};
    return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
  storedNote = "old note";
});

describe("updateApplicationEvent invalidation", () => {
  it("refetches the application detail so its embedded event shows the edit", async () => {
    const store = makeStore();
    store.dispatch(endpoints.getApplication.initiate("app-1"));
    store.dispatch(endpoints.getApplication.initiate("app-2"));
    store.dispatch(endpoints.listApplicationEvents.initiate("app-1"));
    store.dispatch(endpoints.listApplicationsKanban.initiate());
    await settle(store);
    expect(endpoints.getApplication.select("app-1")(store.getState()).data?.events[0].note).toBe("old note");
    sent.length = 0;

    await store.dispatch(
      endpoints.updateApplicationEvent.initiate({
        applicationId: "app-1",
        eventId: "e-1",
        body: { note: "new note" },
      }),
    );
    await settle(store);

    expect(endpoints.getApplication.select("app-1")(store.getState()).data?.events[0].note).toBe("new note");
    expect(getsTo("/api/applications/app-1")).toBe(1);
    expect(getsTo("/api/applications/app-1/events")).toBe(1);
    expect(getsTo("/api/applications/app-2")).toBe(0);
    expect(getsTo("/api/applications?view=kanban")).toBe(0);
  });
});
