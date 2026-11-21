/**
 * Deleting an application changes what Documents shows (the server stops reporting a
 * link to it), and deleting a company removes the documents of its deleted
 * applications, so both reload every cached Documents list and document read.
 */
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, expect, it } from "vitest";
import { DOCUMENTS_PAGE_SIZE } from "../constants/documentsPaging";
import "../store/applicationsApi";
import "../store/companiesApi";
import "../store/documentsApi";

const sent: InternalAxiosRequestConfig[] = [];
const LIST_URI = `/api/documents?limit=${DOCUMENTS_PAGE_SIZE}&offset=0`;

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
    const data = config.url === "/documents" ? { items: [], total: 0 } : config.method === "delete" ? null : { id: "doc-1" };
    return Promise.resolve({ data, status: config.method === "delete" ? 204 : 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
});

it.each([
  ["an application", "deleteApplication", "app-1", "/applications/app-1"],
  ["a company", "deleteCompany", "co-1", "/companies/co-1"],
])("reloads the cached Documents list and document reads after %s is deleted", async (_what, endpoint, id, url) => {
  const store = makeStore();
  store.dispatch(endpoints.listDocuments.initiate({}));
  store.dispatch(endpoints.getDocument.initiate("doc-1"));
  await settle(store);
  sent.length = 0;

  await store.dispatch(endpoints[endpoint].initiate(id));
  await settle(store);

  expect(sent.filter((config) => config.method === "delete").map((config) => config.url)).toEqual([url]);
  expect(getsTo(LIST_URI)).toBe(1);
  expect(getsTo("/api/documents/doc-1")).toBe(1);
});
