import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BLACKOUT_ATTACHMENT_UPLOAD_TIMEOUT_MS } from "../constants/blackoutAttachments";
import { calendarApi } from "../store/calendarApi";

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
    orgStore: { get: () => "w1" },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    seen.push(config);
    return Promise.resolve({ data: [], status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  seen = [];
});

describe("calendarApi writes and review queue", () => {
  it("saves notes with a PATCH on the booking", async () => {
    await newStore().dispatch(calendarApi.endpoints.updateBlackout.initiate({ blackoutId: "b1", body: { host_notes: "Sam" } }));
    expect(seen[0]).toMatchObject({ method: "patch", url: "/listings/blackouts/b1" });
    expect(JSON.parse(String(seen[0].data))).toEqual({ host_notes: "Sam" });
  });

  it("lists a booking's attachments", async () => {
    await newStore().dispatch(calendarApi.endpoints.getBlackoutAttachments.initiate("b1"));
    expect(seen[0]).toMatchObject({ url: "/listings/blackouts/b1/attachments" });
  });

  it("uploads an attachment as a form, with the long upload timeout", async () => {
    const form = new FormData();
    form.append("file", new Blob(["x"], { type: "application/pdf" }), "a.pdf");
    await newStore().dispatch(calendarApi.endpoints.uploadBlackoutAttachment.initiate({ blackoutId: "b1", form }));
    expect(seen[0]).toMatchObject({ method: "post", url: "/listings/blackouts/b1/attachments", timeout: BLACKOUT_ATTACHMENT_UPLOAD_TIMEOUT_MS });
    expect(seen[0].data).toBe(form);
  });

  it("deletes an attachment", async () => {
    await newStore().dispatch(calendarApi.endpoints.deleteBlackoutAttachment.initiate({ blackoutId: "b1", attachmentId: "f1" }));
    expect(seen[0]).toMatchObject({ method: "delete", url: "/listings/blackouts/b1/attachments/f1" });
  });

  it("loads the review queue", async () => {
    await newStore().dispatch(calendarApi.endpoints.getReviewQueue.initiate());
    expect(seen[0]).toMatchObject({ url: "/calendar/review-queue" });
  });

  it("resolves a queue item onto a listing", async () => {
    await newStore().dispatch(calendarApi.endpoints.resolveQueueItem.initiate({ itemId: "q1", body: { listing_id: "li1" } }));
    expect(seen[0]).toMatchObject({ method: "post", url: "/calendar/review-queue/q1/resolve" });
    expect(JSON.parse(String(seen[0].data))).toEqual({ listing_id: "li1" });
  });

  it("ignores a queue item's listing", async () => {
    await newStore().dispatch(calendarApi.endpoints.ignoreQueueItem.initiate({ itemId: "q1", body: { source_listing_id: "air-77" } }));
    expect(seen[0]).toMatchObject({ method: "post", url: "/calendar/review-queue/q1/ignore" });
    expect(JSON.parse(String(seen[0].data))).toEqual({ source_listing_id: "air-77" });
  });

  it("dismisses a queue item", async () => {
    await newStore().dispatch(calendarApi.endpoints.dismissQueueItem.initiate("q1"));
    expect(seen[0]).toMatchObject({ method: "delete", url: "/calendar/review-queue/q1" });
  });
});
