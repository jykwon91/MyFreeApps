import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter } from "axios";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { rentReceiptsApi } from "../store/rentReceiptsApi";

const writes: { url: string; data: unknown }[] = [];

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => "w1" },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    writes.push({ url: config.url ?? "", data: JSON.parse(String(config.data)) });
    return Promise.resolve({ data: { receipt_number: "R-2026-0001", attachment_id: "a1" }, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rentReceiptsApi", () => {
  it("sendReceipt dates the receipt with the host's local date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 11:30pm local: a UTC date would already be tomorrow for a US host.
    vi.setSystemTime(new Date(2026, 10, 6, 23, 30));
    const store = configureStore({
      reducer: { [baseApi.reducerPath]: baseApi.reducer },
      middleware: (getDefault) => getDefault().concat(baseApi.middleware),
    });
    const data = { period_start: "2026-11-01", period_end: "2026-11-30", payment_method: "zelle" };
    await store.dispatch(rentReceiptsApi.endpoints.sendReceipt.initiate({ transaction_id: "tx1", data }));
    expect(writes).toEqual([{ url: "/rent-receipts/tx1/send", data: { ...data, today: "2026-11-06" } }]);
  });
});
