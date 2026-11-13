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
    orgStore: { get: () => "w1" },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    sent.push(config);
    return Promise.resolve({ data: [], status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
});

describe("documentsApi", () => {
  it("asks for documents with the server's parameter names", async () => {
    await makeStore().dispatch(endpoints.getDocuments.initiate({ excludeProcessing: true, propertyId: "p1" }));
    expect(sent[0].url).toBe("/documents");
    expect(sent[0].params).toEqual({ property_id: "p1", exclude_processing: true });
    expect(sent[0].headers["X-Organization-Id"]).toBe("w1");
  });

  it("refetches the list after a delete", async () => {
    const store = makeStore();
    store.dispatch(endpoints.getDocuments.initiate({}));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await store.dispatch(endpoints.deleteDocument.initiate("d1"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent.map((config) => `${config.method} ${config.url}`)).toEqual([
      "get /documents",
      "delete /documents/d1",
      "get /documents",
    ]);
  });

  it("deletes several in one request with the ids in the body, then refetches the list", async () => {
    const store = makeStore();
    store.dispatch(endpoints.getDocuments.initiate({}));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await store.dispatch(endpoints.bulkDeleteDocuments.initiate(["d1", "d2"]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent.map((config) => `${config.method} ${config.url}`)).toEqual([
      "get /documents",
      "post /documents/bulk-delete",
      "get /documents",
    ]);
    expect(JSON.parse(String(sent[1].data))).toEqual({ ids: ["d1", "d2"] });
  });

  it("files an upload in the workspace it names, not the active one", async () => {
    const form = new FormData();
    await makeStore().dispatch(endpoints.uploadDocument.initiate({ form, workspaceId: "w2" }));
    await makeStore().dispatch(endpoints.uploadDocument.initiate({ form }));
    expect(sent.map((config) => config.headers["X-Organization-Id"])).toEqual(["w2", "w1"]);
  });

  it("marks a document reference-only with a patch", async () => {
    await makeStore().dispatch(endpoints.toggleEscrowPaid.initiate({ id: "d1", is_escrow_paid: true }));
    expect(`${sent[0].method} ${sent[0].url}`).toBe("patch /documents/d1/escrow-paid");
    expect(JSON.parse(String(sent[0].data))).toEqual({ is_escrow_paid: true });
  });

  it("uploads the form and reports how much has gone out", async () => {
    const form = new FormData();
    form.append("file", new Blob(["x"]), "lease.docx");
    const onUploadProgress = (): void => {};
    await makeStore().dispatch(endpoints.uploadDocument.initiate({ form, onUploadProgress }));
    expect(`${sent[0].method} ${sent[0].url}`).toBe("post /documents/upload");
    expect(sent[0].data).toBe(form);
    expect(sent[0].onUploadProgress).toBe(onUploadProgress);
  });
});
