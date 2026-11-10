/**
 * The add- and remove-contact endpoints, driven through the real slice with a fake
 * axios adapter: what they send, and that the application they belong to refetches
 * (contacts come back embedded in GET /applications/{id}), leaving others alone.
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
    const status = config.method === "delete" ? 204 : config.method === "post" ? 201 : 200;
    return Promise.resolve({ data: {}, status, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
});

async function primed(): Promise<Store> {
  const store = makeStore();
  store.dispatch(endpoints.getApplication.initiate("app-1"));
  store.dispatch(endpoints.getApplication.initiate("app-2"));
  await settle(store);
  sent.length = 0;
  return store;
}

describe("addApplicationContact", () => {
  it("posts the body to the application's contacts, then refetches only that application", async () => {
    const store = await primed();
    const body = { name: "Sam Lee", email: "sam@stripe.com", role: "recruiter" };

    await store.dispatch(endpoints.addApplicationContact.initiate({ applicationId: "app-1", body }));
    await settle(store);

    const posts = sent.filter((config) => config.method === "post");
    expect(posts.map((config) => config.url)).toEqual(["/applications/app-1/contacts"]);
    expect(JSON.parse(String(posts[0].data))).toEqual(body);
    expect(getsTo("/api/applications/app-1")).toBe(1);
    expect(getsTo("/api/applications/app-2")).toBe(0);
  });
});

describe("removeApplicationContact", () => {
  it("deletes the contact under its application, then refetches only that application", async () => {
    const store = await primed();

    await store.dispatch(endpoints.removeApplicationContact.initiate({ applicationId: "app-1", contactId: "k-9" }));
    await settle(store);

    expect(sent.filter((config) => config.method === "delete").map((config) => config.url)).toEqual([
      "/applications/app-1/contacts/k-9",
    ]);
    expect(getsTo("/api/applications/app-1")).toBe(1);
    expect(getsTo("/api/applications/app-2")).toBe(0);
  });
});
