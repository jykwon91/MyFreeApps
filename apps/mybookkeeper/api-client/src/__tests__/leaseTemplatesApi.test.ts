import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter } from "axios";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { leaseTemplatesApi } from "../store/leaseTemplatesApi";

const bodies: unknown[] = [];

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => "w1" },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    bodies.push(JSON.parse(String(config.data)));
    return Promise.resolve({ data: { placeholders: [] }, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("leaseTemplatesApi", () => {
  it("getMultiGenerateDefaults sends the host's local date for today defaults", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 11:30pm local: a UTC date would already be tomorrow for a US host.
    vi.setSystemTime(new Date(2026, 10, 6, 23, 30));
    const store = configureStore({
      reducer: { [baseApi.reducerPath]: baseApi.reducer },
      middleware: (getDefault) => getDefault().concat(baseApi.middleware),
    });
    await store.dispatch(leaseTemplatesApi.endpoints.getMultiGenerateDefaults.initiate({ template_ids: ["t1"], applicant_id: "a1" }));
    expect(bodies).toEqual([{ template_ids: ["t1"], applicant_id: "a1", today: "2026-11-06" }]);
  });
});
