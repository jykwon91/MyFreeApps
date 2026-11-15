import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../store/applicantsApi";
import { signedLeasesApi } from "../store/signedLeasesApi";

type Store = ReturnType<typeof makeStore>;

const TENANTS_URL = "/applicants/tenants";
type Subscription = Promise<unknown> & { unsubscribe: () => void };
type Initiate = { initiate: (arg?: unknown) => Parameters<Store["dispatch"]>[0] };
const endpoints = baseApi.endpoints as unknown as Record<string, Initiate>;

const LEASE = { id: "l1", applicant_id: "a1", parent_lease_id: null };
let tenantFetches = 0;

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
    let data: unknown = LEASE;
    if (config.url === TENANTS_URL) {
      tenantFetches += 1;
      data = { items: [], total: 0, has_more: false };
    } else if (config.method === "delete") {
      data = undefined;
    }
    return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  tenantFetches = 0;
});

async function tenantFetchesAfter(mutate: (store: Store) => Promise<unknown>): Promise<number> {
  const store = makeStore();
  // The default tenant list is active-only, so it never holds an ended tenant's id.
  const subscription = store.dispatch(endpoints.getTenants.initiate({ today: "2026-01-01" })) as unknown as Subscription;
  await subscription;
  await mutate(store);
  await new Promise((resolve) => setTimeout(resolve, 0));
  subscription.unsubscribe();
  return tenantFetches;
}

describe("lease writes refetch the active-only tenant list", () => {
  it.each([
    ["creating a lease", (store: Store) =>
      store.dispatch(signedLeasesApi.endpoints.createSignedLease.initiate({ template_ids: ["t1"], applicant_id: "a1", values: {} }))],
    ["importing a lease", (store: Store) =>
      store.dispatch(signedLeasesApi.endpoints.importSignedLease.initiate(new FormData()))],
    ["editing a lease", (store: Store) =>
      store.dispatch(signedLeasesApi.endpoints.updateSignedLease.initiate({ leaseId: "l1", data: { status: "signed" } }))],
    ["deleting a lease", (store: Store) =>
      store.dispatch(signedLeasesApi.endpoints.deleteSignedLease.initiate({ leaseId: "l1", applicantId: "a1" }))],
    ["extending a lease", (store: Store) =>
      store.dispatch(signedLeasesApi.endpoints.extendSignedLease.initiate({ leaseId: "l1", data: { new_ends_on: "2027-01-01" } }))],
    ["undoing an extension", (store: Store) =>
      store.dispatch(signedLeasesApi.endpoints.undoSignedLeaseExtension.initiate({ leaseId: "l1", versionId: "v1" }))],
  ])("%s", async (_name, mutate) => {
    expect(await tenantFetchesAfter(mutate)).toBe(2);
  });

  it("uploading an attachment leaves the tenant list alone", async () => {
    const fetches = await tenantFetchesAfter((store) =>
      store.dispatch(signedLeasesApi.endpoints.uploadSignedLeaseAttachment.initiate({ leaseId: "l1", form: new FormData() })));
    expect(fetches).toBe(1);
  });
});
