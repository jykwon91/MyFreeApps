import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { integrationsApi } from "../store/integrationsApi";

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

describe("integrationsApi reads", () => {
  it("reads the integrations, the sync history and the email queue", async () => {
    const store = newStore();
    await store.dispatch(integrationsApi.endpoints.getIntegrations.initiate());
    await store.dispatch(integrationsApi.endpoints.getSyncLogs.initiate());
    await store.dispatch(integrationsApi.endpoints.getEmailQueue.initiate());
    expect(seen.map((request) => `${request.method} ${request.url}`)).toEqual([
      "get /integrations",
      "get /integrations/gmail/logs",
      "get /integrations/gmail/queue",
    ]);
  });
});

describe("integrationsApi writes", () => {
  it("syncs, extracts, retries and disconnects with the right verbs", async () => {
    const store = newStore();
    await store.dispatch(integrationsApi.endpoints.syncGmail.initiate());
    await store.dispatch(integrationsApi.endpoints.extractAll.initiate());
    await store.dispatch(integrationsApi.endpoints.retryAllFailed.initiate());
    await store.dispatch(integrationsApi.endpoints.retryQueueItem.initiate("q1"));
    await store.dispatch(integrationsApi.endpoints.dismissQueueItem.initiate("q1"));
    await store.dispatch(integrationsApi.endpoints.disconnectGmail.initiate());
    expect(seen.map((request) => `${request.method} ${request.url}`)).toEqual([
      "post /integrations/gmail/sync",
      "post /integrations/gmail/extract",
      "post /integrations/gmail/queue/retry-all",
      "post /integrations/gmail/queue/q1/retry",
      "delete /integrations/gmail/queue/q1",
      "delete /integrations/gmail",
    ]);
  });

  it("cancels one sync by id, or the latest when no id is given", async () => {
    const store = newStore();
    await store.dispatch(integrationsApi.endpoints.cancelGmailSync.initiate({ sync_log_id: 7 }));
    await store.dispatch(integrationsApi.endpoints.cancelGmailSync.initiate());
    expect(seen[0]).toMatchObject({ method: "post", url: "/integrations/gmail/sync/cancel" });
    expect(JSON.parse(String(seen[0].data))).toEqual({ sync_log_id: 7 });
    expect(JSON.parse(String(seen[1].data))).toEqual({});
  });

  it("changes the label with a PATCH", async () => {
    await newStore().dispatch(integrationsApi.endpoints.updateGmailLabel.initiate({ label: "Receipts" }));
    expect(seen[0]).toMatchObject({ method: "patch", url: "/integrations/gmail/label" });
    expect(JSON.parse(String(seen[0].data))).toEqual({ label: "Receipts" });
  });

  it("asks for the Google sign-in address", async () => {
    await newStore().dispatch(integrationsApi.endpoints.connectGmail.initiate());
    expect(seen[0]).toMatchObject({ method: "get", url: "/integrations/gmail/connect" });
  });
});
