import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../store/documentsApi";

const sent: InternalAxiosRequestConfig[] = [];

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

type Initiate = { initiate: (arg?: unknown) => Parameters<ReturnType<typeof makeStore>["dispatch"]>[0] };
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
    return Promise.resolve({ data: { items: [], total: 0 }, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
});

describe("documentsApi", () => {
  it("lists every document when no filter is given", async () => {
    await makeStore().dispatch(endpoints.listDocuments.initiate());
    expect(api.getUri(sent[0])).toBe("/api/documents");
  });

  it("leaves out empty filters", async () => {
    await makeStore().dispatch(endpoints.listDocuments.initiate({ application_id: "", kind: "" }));
    expect(api.getUri(sent[0])).toBe("/api/documents");
  });

  it("filters by application and kind", async () => {
    await makeStore().dispatch(endpoints.listDocuments.initiate({ application_id: "app-1", kind: "cover_letter" }));
    expect(api.getUri(sent[0])).toBe("/api/documents?application_id=app-1&kind=cover_letter");
  });

  it("posts the caller's form as-is", async () => {
    const form = new FormData();
    form.append("title", "Resume");
    await makeStore().dispatch(endpoints.uploadDocument.initiate(form));
    expect(sent[0].url).toBe("/documents/upload");
    expect(sent[0].method).toBe("post");
    expect(sent[0].data).toBe(form);
  });
});
