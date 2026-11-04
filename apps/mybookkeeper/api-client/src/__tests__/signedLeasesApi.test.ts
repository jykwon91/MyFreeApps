import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../store/applicantsApi";
import "../store/signedLeasesApi";

const reads: string[] = [];

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
    if (config.method === "get") reads.push(config.url ?? "");
    return Promise.resolve({ data: { id: "new", parent_lease_id: "old", applicant_id: "a1" }, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  reads.length = 0;
});

describe("signedLeasesApi", () => {
  it.each([
    ["createSignedLease", {}],
    ["importSignedLease", {}],
  ])("%s reloads the lease the new one follows", async (endpoint, arg) => {
    const store = makeStore();
    store.dispatch(endpoints.getSignedLeaseById.initiate("old"));
    await store.dispatch(endpoints.getSignedLeaseById.initiate("old"));
    reads.length = 0;
    await store.dispatch(endpoints[endpoint].initiate(arg));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reads).toEqual(["/signed-leases/old"]);
  });

  it.each([
    ["extendSignedLease", { leaseId: "l1", data: { new_ends_on: "2027-01-01" } }],
    ["undoSignedLeaseExtension", { leaseId: "l1", versionId: "v1" }],
  ])("%s reloads the tenant, whose tenancy it can change", async (endpoint, arg) => {
    const store = makeStore();
    await store.dispatch(endpoints.getApplicantById.initiate("a1"));
    reads.length = 0;
    await store.dispatch(endpoints[endpoint].initiate(arg));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reads).toEqual(["/applicants/a1"]);
  });
});
