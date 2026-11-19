import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DOCUMENT_PAGE_SIZE } from "../constants/documentPaging";
import { DEFAULT_DOCUMENT_VIEW } from "../constants/documentListView";
import { EMAIL_DERIVED_TAGS } from "../constants/emailDerivedTags";
import "../store/documentsApi";
import { integrationsApi } from "../store/integrationsApi";

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
    const data = config.url?.startsWith("/documents/page") ? { items: [], total: 0, has_more: false } : [];
    return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
});

describe("documentsApi", () => {
  it("asks for the documents in one status with the server's parameter name", async () => {
    await makeStore().dispatch(endpoints.getDocuments.initiate({ status: "processing" }));
    expect(sent[0].url).toBe("/documents");
    expect(sent[0].params).toEqual({ status: "processing" });
    expect(sent[0].headers["X-Organization-Id"]).toBe("w1");
  });

  it("asks for the first page of the list with its filters as repeated keys and the order", async () => {
    await makeStore().dispatch(
      endpoints.listDocumentPages.initiate({ ...DEFAULT_DOCUMENT_VIEW, search: " bill ", statuses: ["failed", "duplicate"], needsReview: true }),
    );
    expect(sent[0].url).toBe(
      `/documents/page?search=bill&statuses=failed&statuses=duplicate&needs_review=true&sort_by=created_at&sort_dir=desc&limit=${DOCUMENT_PAGE_SIZE}&offset=0`,
    );
  });

  it("asks for every match for select all by the filters alone", async () => {
    await makeStore().dispatch(endpoints.listDocumentSelection.initiate({ ...DEFAULT_DOCUMENT_VIEW, sources: ["email"], excludeProcessing: true }));
    expect(sent[0].url).toBe("/documents/selection?sources=email&exclude_processing=true");
  });

  it("refetches the list after a delete", async () => {
    const store = makeStore();
    store.dispatch(endpoints.getDocuments.initiate({ status: "processing" }));
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
    store.dispatch(endpoints.getDocuments.initiate({ status: "processing" }));
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

  it("asks for the counts alone, not the list", async () => {
    await makeStore().dispatch(endpoints.getDocumentSummary.initiate());
    expect(sent.map((config) => `${config.method} ${config.url}`)).toEqual(["get /documents/summary"]);
  });

  it("refetches the counts after an upload or a delete, as it does the list", async () => {
    const store = makeStore();
    store.dispatch(endpoints.getDocumentSummary.initiate());
    await new Promise((resolve) => setTimeout(resolve, 0));
    await store.dispatch(endpoints.uploadDocument.initiate({ form: new FormData() }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await store.dispatch(endpoints.deleteDocument.initiate("d1"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent.map((config) => `${config.method} ${config.url}`)).toEqual([
      "get /documents/summary",
      "post /documents/upload",
      "get /documents/summary",
      "delete /documents/d1",
      "get /documents/summary",
    ]);
  });

  it("refetches the counts when an extraction finishes", async () => {
    const store = makeStore();
    store.dispatch(endpoints.getDocumentSummary.initiate());
    await new Promise((resolve) => setTimeout(resolve, 0));
    store.dispatch(integrationsApi.util.invalidateTags(EMAIL_DERIVED_TAGS));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent.map((config) => config.url)).toEqual(["/documents/summary", "/documents/summary"]);
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
