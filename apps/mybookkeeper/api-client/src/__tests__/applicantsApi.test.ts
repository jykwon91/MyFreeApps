import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getAllowedTransitions } from "../utils/applicantStageTransitions";
import "../store/applicantsApi";

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

describe("applicantsApi", () => {
  it("lists by stage", async () => {
    await makeStore().dispatch(endpoints.getApplicants.initiate({ stage: "approved", limit: 25, offset: 50 }));
    expect(sent[0].url).toBe("/applicants");
    expect(sent[0].params).toEqual({ stage: "approved", limit: 25, offset: 50 });
  });

  it("asks for one page at a time", async () => {
    await makeStore().dispatch(endpoints.listApplicantPages.initiate({ stage: "approved" }));
    expect(sent[0].params).toEqual({ stage: "approved", limit: 25, offset: 0 });
  });

  it("promotes an inquiry", async () => {
    await makeStore().dispatch(endpoints.promoteFromInquiry.initiate({ inquiryId: "i1", data: {} }));
    expect(sent[0].method).toBe("post");
    expect(sent[0].url).toBe("/applicants/promote/i1");
  });

  it("knows a declined applicant has nowhere further to go", () => {
    expect(getAllowedTransitions("declined")).not.toContain("approved");
  });
});
