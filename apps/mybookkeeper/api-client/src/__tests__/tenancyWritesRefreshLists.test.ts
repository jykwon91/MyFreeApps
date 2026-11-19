import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../store/applicantsApi";

type Store = ReturnType<typeof makeStore>;
type Subscription = Promise<unknown> & { unsubscribe: () => void };
type Initiate = { initiate: (arg?: unknown) => Parameters<Store["dispatch"]>[0] };
const endpoints = baseApi.endpoints as unknown as Record<string, Initiate>;

const TENANTS_URL = "/applicants/tenants";
const APPLICANTS_URL = "/applicants";
const fetches: Record<string, number> = {};

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => "w1" },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    const url = config.url ?? "";
    if (config.method === "get") fetches[url] = (fetches[url] ?? 0) + 1;
    const data = url === TENANTS_URL || url === APPLICANTS_URL
      ? { items: [], total: 0, has_more: false }
      : {};
    return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  for (const key of Object.keys(fetches)) delete fetches[key];
});

async function listFetchesAfter(mutate: (store: Store) => unknown): Promise<{ tenants: number; applicants: number }> {
  const store = makeStore();
  const tenantList = store.dispatch(endpoints.listTenantPages.initiate({ include_ended: false, today: "2026-01-01" })) as unknown as Subscription;
  const applicantList = store.dispatch(endpoints.listApplicantPages.initiate({})) as unknown as Subscription;
  await Promise.all([tenantList, applicantList]);
  await mutate(store);
  await new Promise((resolve) => setTimeout(resolve, 0));
  tenantList.unsubscribe();
  applicantList.unsubscribe();
  return { tenants: fetches[TENANTS_URL], applicants: fetches[APPLICANTS_URL] };
}

describe("tenancy writes refetch both the tenant list and the applicant list", () => {
  it.each([
    ["editing contract dates", (store: Store) =>
      store.dispatch(endpoints.updateApplicantContractDates.initiate({ applicantId: "a1", data: { contract_start: "2027-01-01" } }))],
    ["ending a tenancy", (store: Store) =>
      store.dispatch(endpoints.endTenancy.initiate({ applicantId: "a1", data: { reason: "moved out" } }))],
    ["restarting a tenancy", (store: Store) =>
      store.dispatch(endpoints.restartTenancy.initiate("a1"))],
    ["moving the stage", (store: Store) =>
      store.dispatch(endpoints.transitionApplicantStage.initiate({ applicantId: "a1", data: { new_stage: "lease_signed" } }))],
  ])("%s", async (_name, mutate) => {
    expect(await listFetchesAfter(mutate)).toEqual({ tenants: 2, applicants: 2 });
  });
});
