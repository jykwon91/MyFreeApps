import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LISTING_PHOTO_UPLOAD_TIMEOUT_MS } from "../constants/listingPhotos";
import "../store/listingsApi";

const requests: InternalAxiosRequestConfig[] = [];

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
    requests.push(config);
    const data = config.method === "get" ? [] : { id: "x" };
    return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  requests.length = 0;
});

async function send(endpoint: string, arg: unknown) {
  const store = makeStore();
  await store.dispatch(endpoints[endpoint].initiate(arg));
  return requests[0];
}

const sentBody = (request: InternalAxiosRequestConfig) => JSON.parse(String(request.data));

describe("listingsApi writes", () => {
  it("creates a listing", async () => {
    const request = await send("createListing", { title: "Room" });
    expect([request.method, request.url]).toEqual(["post", "/listings"]);
    expect(sentBody(request)).toEqual({ title: "Room" });
  });

  it("updates a listing with PUT and only the given fields", async () => {
    const request = await send("updateListing", { id: "l1", data: { status: "listed" } });
    expect([request.method, request.url]).toEqual(["put", "/listings/l1"]);
    expect(sentBody(request)).toEqual({ status: "listed" });
  });

  it("deletes a listing", async () => {
    const request = await send("deleteListing", "l1");
    expect([request.method, request.url]).toEqual(["delete", "/listings/l1"]);
  });

  it("uploads photos as multipart with the long timeout", async () => {
    const form = new FormData();
    form.append("files", new Blob(["x"]), "a.jpg");
    const request = await send("uploadListingPhotos", { listingId: "l1", form });
    expect([request.method, request.url]).toEqual(["post", "/listings/l1/photos"]);
    expect(request.data).toBe(form);
    expect(request.timeout).toBe(LISTING_PHOTO_UPLOAD_TIMEOUT_MS);
  });

  it("updates a photo, sending only what was given", async () => {
    const request = await send("updateListingPhoto", { listingId: "l1", photoId: "p1", display_order: 0 });
    expect([request.method, request.url]).toEqual(["patch", "/listings/l1/photos/p1"]);
    expect(sentBody(request)).toEqual({ display_order: 0 });
  });

  it("deletes a photo", async () => {
    const request = await send("deleteListingPhoto", { listingId: "l1", photoId: "p1" });
    expect([request.method, request.url]).toEqual(["delete", "/listings/l1/photos/p1"]);
  });

  it("adds, changes and removes an external link", async () => {
    const created = await send("createListingExternalId", { listingId: "l1", data: { source: "Airbnb", external_id: "9" } });
    expect([created.method, created.url]).toEqual(["post", "/listings/l1/external-ids"]);
    requests.length = 0;
    const updated = await send("updateListingExternalId", { listingId: "l1", externalIdPk: "k1", data: { external_id: null } });
    expect([updated.method, updated.url]).toEqual(["patch", "/listings/l1/external-ids/k1"]);
    expect(sentBody(updated)).toEqual({ external_id: null });
    requests.length = 0;
    const removed = await send("deleteListingExternalId", { listingId: "l1", externalIdPk: "k1" });
    expect([removed.method, removed.url]).toEqual(["delete", "/listings/l1/external-ids/k1"]);
  });

  it("reads channels and a listing's channels", async () => {
    expect((await send("getChannels", undefined)).url).toBe("/channels");
    requests.length = 0;
    expect((await send("getListingChannels", "l1")).url).toBe("/listings/l1/channels");
  });

  it("adds, changes and removes a channel listing", async () => {
    const created = await send("createListingChannel", { listingId: "l1", data: { channel_id: "c1", external_url: "https://a.example" } });
    expect([created.method, created.url]).toEqual(["post", "/listings/l1/channels"]);
    requests.length = 0;
    const updated = await send("updateChannelListing", { listingId: "l1", channelListingId: "cl1", data: { external_id: "z" } });
    expect([updated.method, updated.url]).toEqual(["patch", "/channel-listings/cl1"]);
    requests.length = 0;
    const removed = await send("deleteChannelListing", { listingId: "l1", channelListingId: "cl1" });
    expect([removed.method, removed.url]).toEqual(["delete", "/channel-listings/cl1"]);
  });
});
