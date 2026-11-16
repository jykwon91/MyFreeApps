import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  MODEL_REQUEST_TIMEOUT_MS,
  UPLOAD_REQUEST_TIMEOUT_MS,
} from "@platform/core/constants/requestTimeouts";
import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DISCOVERY_REFRESH_TIMEOUT_MS } from "../constants/discoveryRefresh";
import "../store/applicationsApi";
import "../store/companiesApi";
import "../store/discoverApi";
import "../store/documentsApi";
import "../store/jobAnalysisApi";
import "../store/resumeRefinementApi";
import "../store/resumesApi";

type Initiate = { initiate: (arg?: unknown) => Parameters<ReturnType<typeof newStore>["dispatch"]>[0] };
const endpoints = baseApi.endpoints as unknown as Record<string, Initiate>;

let seen: InternalAxiosRequestConfig[] = [];

function newStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    seen.push(config);
    return Promise.resolve({ data: {}, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  seen = [];
});

// Each of these sends a file, waits on a model, or asks a job board while the user waits.
const LONG_REQUESTS: [endpoint: string, arg: unknown, timeout: number][] = [
  ["uploadResume", new FormData(), UPLOAD_REQUEST_TIMEOUT_MS],
  ["uploadDocument", new FormData(), UPLOAD_REQUEST_TIMEOUT_MS],
  ["parseJobDescription", { jd_text: "jd" }, MODEL_REQUEST_TIMEOUT_MS],
  ["extractJdFromUrl", { url: "https://example.com/job" }, MODEL_REQUEST_TIMEOUT_MS],
  ["analyzeJob", { jd_text: "jd" }, MODEL_REQUEST_TIMEOUT_MS],
  ["triggerCompanyResearch", "c1", MODEL_REQUEST_TIMEOUT_MS],
  ["acceptPending", "s1", MODEL_REQUEST_TIMEOUT_MS],
  ["acceptFlagged", "s1", MODEL_REQUEST_TIMEOUT_MS],
  ["supplyCustomRewrite", { id: "s1", user_text: "text" }, MODEL_REQUEST_TIMEOUT_MS],
  ["requestAlternative", { id: "s1" }, MODEL_REQUEST_TIMEOUT_MS],
  ["skipTarget", "s1", MODEL_REQUEST_TIMEOUT_MS],
  ["navigateRefinement", { id: "s1", direction: "next" }, MODEL_REQUEST_TIMEOUT_MS],
  ["createTargetFromLine", { id: "s1", current_text: "line", section: "experience" }, MODEL_REQUEST_TIMEOUT_MS],
  ["refreshDiscoverySource", "src1", DISCOVERY_REFRESH_TIMEOUT_MS],
];

describe("requests that take longer than the default", () => {
  it.each(LONG_REQUESTS)("%s waits longer than the default", async (endpoint, arg, timeout) => {
    await newStore().dispatch(endpoints[endpoint].initiate(arg));
    expect(seen).toHaveLength(1);
    expect(seen[0].timeout).toBe(timeout);
    expect(timeout).toBeGreaterThan(DEFAULT_REQUEST_TIMEOUT_MS);
  });
});
