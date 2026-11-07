import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter } from "axios";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "../store/rentLedgerApi";

const reads: { url: string; params: unknown }[] = [];
const writes: { url: string; data: unknown }[] = [];

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
    if (config.method === "get") reads.push({ url: config.url ?? "", params: config.params });
    else writes.push({ url: config.url ?? "", data: JSON.parse(String(config.data)) });
    return Promise.resolve({ data: {}, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  reads.length = 0;
  writes.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rentLedgerApi", () => {
  it("getRentLedger evaluates the ledger on the host's local date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 11:30pm local: a UTC date would already be tomorrow for a US host.
    vi.setSystemTime(new Date(2026, 10, 6, 23, 30));
    await makeStore().dispatch(endpoints.getRentLedger.initiate({ applicantId: "a1" }));
    expect(reads).toEqual([{ url: "/rent-ledger/tenants/a1", params: { as_of: "2026-11-06" } }]);
  });

  it("getRentLedger keeps an explicit as-of date", async () => {
    await makeStore().dispatch(endpoints.getRentLedger.initiate({ applicantId: "a1", asOf: "2026-08-20" }));
    expect(reads).toEqual([{ url: "/rent-ledger/tenants/a1", params: { as_of: "2026-08-20" } }]);
  });

  it.each([
    [
      "createRentSchedule",
      { applicant_id: "a1", amount: "1500", cadence: "monthly", start_date: "2026-08-01" },
      "/rent-ledger/schedules",
      { applicant_id: "a1", amount: "1500", cadence: "monthly", start_date: "2026-08-01" },
    ],
    [
      "updateRentSchedule",
      { scheduleId: "s1", applicantId: "a1", notes: "Pays weekly" },
      "/rent-ledger/schedules/s1",
      { notes: "Pays weekly" },
    ],
  ])("%s sends the host's local date so no charge is written for tomorrow", async (endpoint, arg, url, body) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 11:30pm on the last day of a month: UTC would already be next month.
    vi.setSystemTime(new Date(2026, 9, 31, 23, 30));
    await makeStore().dispatch(endpoints[endpoint].initiate(arg));
    expect(writes).toEqual([{ url, data: { ...body, today: "2026-10-31" } }]);
  });
});
