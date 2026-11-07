import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../store/calendarApi";

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

describe("calendarApi", () => {
  it("always sends the window the screen shows", async () => {
    await makeStore().dispatch(endpoints.getCalendarEvents.initiate({ from: "2026-11-01", to: "2026-12-01" }));
    expect(sent[0].url).toBe("/calendar/events");
    expect(sent[0].params).toEqual({ from: "2026-11-01", to: "2026-12-01" });
  });

  it("joins the filters into comma-separated lists", async () => {
    await makeStore().dispatch(
      endpoints.getCalendarEvents.initiate({
        from: "2026-11-01",
        to: "2026-12-01",
        property_ids: ["p1", "p2"],
        sources: ["airbnb"],
        listing_ids: [],
      }),
    );
    expect(sent[0].params).toEqual({ from: "2026-11-01", to: "2026-12-01", property_ids: "p1,p2", sources: "airbnb" });
  });
});
