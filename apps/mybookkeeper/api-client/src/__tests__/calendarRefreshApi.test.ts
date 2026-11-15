import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { calendarApi } from "../store/calendarApi";
import { listingsApi } from "../store/listingsApi";
import { signedLeasesApi } from "../store/signedLeasesApi";

let seen: InternalAxiosRequestConfig[] = [];

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

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
    orgStore: { get: () => "w1" },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    seen.push(config);
    return Promise.resolve({ data: config.url === "/calendar/events" ? [] : {}, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  seen = [];
});

async function calendarRefetchesAfter(run: (store: ReturnType<typeof newStore>) => Promise<unknown>): Promise<boolean> {
  const store = newStore();
  const subscription = store.dispatch(calendarApi.endpoints.getCalendarEvents.initiate({ from: "2026-01-01", to: "2026-02-01" }));
  await settle();
  seen = [];
  await run(store);
  await settle();
  subscription.unsubscribe();
  return seen.some((config) => config.url === "/calendar/events");
}

describe("an open calendar refetches after a change to what it shows", () => {
  const leaseWrites: Record<string, (store: ReturnType<typeof newStore>) => Promise<unknown>> = {
    createSignedLease: (s) => s.dispatch(signedLeasesApi.endpoints.createSignedLease.initiate({} as never)),
    updateSignedLease: (s) => s.dispatch(signedLeasesApi.endpoints.updateSignedLease.initiate({ leaseId: "l1", data: {} as never })),
    deleteSignedLease: (s) => s.dispatch(signedLeasesApi.endpoints.deleteSignedLease.initiate({ leaseId: "l1", applicantId: "a1" })),
    generateSignedLease: (s) => s.dispatch(signedLeasesApi.endpoints.generateSignedLease.initiate("l1")),
    extendSignedLease: (s) => s.dispatch(signedLeasesApi.endpoints.extendSignedLease.initiate({ leaseId: "l1", data: {} as never })),
    undoSignedLeaseExtension: (s) => s.dispatch(signedLeasesApi.endpoints.undoSignedLeaseExtension.initiate({ leaseId: "l1", versionId: "v1" })),
    importSignedLease: (s) => s.dispatch(signedLeasesApi.endpoints.importSignedLease.initiate(new FormData())),
    addSignedLeaseTemplates: (s) => s.dispatch(signedLeasesApi.endpoints.addSignedLeaseTemplates.initiate({ leaseId: "l1", templateIds: ["t1"] })),
    updateListing: (s) => s.dispatch(listingsApi.endpoints.updateListing.initiate({ id: "x1", data: {} as never })),
    deleteListing: (s) => s.dispatch(listingsApi.endpoints.deleteListing.initiate("x1")),
    deleteChannelListing: (s) => s.dispatch(listingsApi.endpoints.deleteChannelListing.initiate({ listingId: "x1", channelListingId: "c1" })),
  };

  it.each(Object.entries(leaseWrites))("%s", async (_name, run) => {
    expect(await calendarRefetchesAfter(run)).toBe(true);
  });
});
