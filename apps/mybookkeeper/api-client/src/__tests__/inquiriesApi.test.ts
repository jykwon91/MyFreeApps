import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../store/inquiriesApi";
import "../store/integrationsApi";
import "../store/listingsApi";

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
    return Promise.resolve({ data: { items: [], total: 0, has_more: false }, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
});

describe("inquiries endpoints", () => {
  it("asks for one page of a stage and spam status", async () => {
    await makeStore().dispatch(
      endpoints.getInquiries.initiate({ stage: "new", spam_status: "flagged", limit: 25, offset: 50 }),
    );
    expect(sent[0].url).toBe("/inquiries");
    expect(sent[0].params).toMatchObject({ stage: "new", spam_status: "flagged", limit: 25, offset: 50 });
  });

  it("asks for the inbox", async () => {
    await makeStore().dispatch(endpoints.getInquiries.initiate({ inbox_only: true }));
    expect(sent[0].params).toMatchObject({ inbox_only: true });
  });

  it("sends a reply to that inquiry", async () => {
    await makeStore().dispatch(
      endpoints.sendInquiryReply.initiate({ inquiryId: "i1", data: { subject: "Hi", body: "Hello" } }),
    );
    expect(sent[0].method).toBe("post");
    expect(sent[0].url).toBe("/inquiries/i1/reply");
    expect(sent[0].timeout).toBe(60000);
  });

  it("marks an inquiry as spam", async () => {
    await makeStore().dispatch(endpoints.markInquirySpam.initiate("i1"));
    expect(sent[0].method).toBe("post");
    expect(sent[0].url).toBe("/inquiries/i1/mark-spam");
  });
});

describe("read endpoints shared with the phone", () => {
  it("reads Gmail status from integrations", async () => {
    await makeStore().dispatch(endpoints.getIntegrations.initiate());
    expect(sent[0].url).toBe("/integrations");
  });

  it("reads listings", async () => {
    await makeStore().dispatch(endpoints.getListings.initiate({ limit: 100 }));
    expect(sent[0].url).toBe("/listings");
    expect(sent[0].params).toMatchObject({ limit: 100 });
  });
});

describe("updateInquiry", () => {
  it("shows the saved inquiry at once, without waiting for the refetch", async () => {
    const originalAdapter = api.defaults.adapter;
    const answers: unknown[] = [{ id: "i1", stage: "new" }, { id: "i1", stage: "replied" }];
    const adapter: AxiosAdapter = (config) => {
      const answer = answers.shift();
      // Anything after the save is the refetch, which never lands in this test.
      if (!answer) return new Promise(() => {});
      return Promise.resolve({ data: answer, status: 200, statusText: "", headers: {}, config });
    };
    api.defaults.adapter = adapter;
    const store = makeStore();
    const read = store.dispatch(endpoints.getInquiryById.initiate("i1"));
    await read;
    await store.dispatch(endpoints.updateInquiry.initiate({ id: "i1", data: { stage: "replied" } }));
    const state = store.getState()[baseApi.reducerPath].queries['getInquiryById("i1")'];
    expect(state?.data).toEqual({ id: "i1", stage: "replied" });
    api.defaults.adapter = originalAdapter;
  });
});

describe("archived reply templates", () => {
  const active = { id: "t1", name: "Active", display_order: 0, is_archived: false };
  const old = { id: "t2", name: "Old", display_order: 0, is_archived: true };

  // Answers each request in turn; anything after that is a refetch that never lands.
  function answering(...answers: unknown[]) {
    const originalAdapter = api.defaults.adapter;
    const adapter: AxiosAdapter = (config) => {
      sent.push(config);
      if (answers.length === 0) return new Promise(() => {});
      return Promise.resolve({ data: answers.shift(), status: 200, statusText: "", headers: {}, config });
    };
    api.defaults.adapter = adapter;
    return () => {
      api.defaults.adapter = originalAdapter;
    };
  }

  function cached(store: ReturnType<typeof makeStore>, key: string) {
    return store.getState()[baseApi.reducerPath].queries[key]?.data;
  }

  it("asks for archived ones too and keeps only those", async () => {
    const restore = answering([active, old]);
    const store = makeStore();
    await store.dispatch(endpoints.getArchivedReplyTemplates.initiate());
    expect(sent[0].url).toBe("/reply-templates");
    expect(sent[0].params).toMatchObject({ include_archived: true });
    expect(cached(store, "getArchivedReplyTemplates(undefined)")).toEqual([old]);
    restore();
  });

  it("moves an archived template into the archived list at once", async () => {
    const restore = answering([active], [old], undefined);
    const store = makeStore();
    await store.dispatch(endpoints.getReplyTemplates.initiate());
    await store.dispatch(endpoints.getArchivedReplyTemplates.initiate());
    await store.dispatch(endpoints.archiveReplyTemplate.initiate("t1"));
    expect(cached(store, "getReplyTemplates(undefined)")).toEqual([]);
    expect(cached(store, "getArchivedReplyTemplates(undefined)")).toEqual([
      { ...active, is_archived: true },
      old,
    ]);
    restore();
  });

  it("moves a restored template back into the templates at once", async () => {
    const restored = { ...old, is_archived: false };
    const restore = answering([active], [active, old], restored);
    const store = makeStore();
    await store.dispatch(endpoints.getReplyTemplates.initiate());
    await store.dispatch(endpoints.getArchivedReplyTemplates.initiate());
    await store.dispatch(endpoints.updateReplyTemplate.initiate({ id: "t2", data: { is_archived: false } }));
    expect(cached(store, "getReplyTemplates(undefined)")).toEqual([active, restored]);
    expect(cached(store, "getArchivedReplyTemplates(undefined)")).toEqual([]);
    restore();
  });
});
