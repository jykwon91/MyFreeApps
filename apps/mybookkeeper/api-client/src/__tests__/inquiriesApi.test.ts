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
