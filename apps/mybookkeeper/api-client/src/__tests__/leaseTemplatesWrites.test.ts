import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { leaseTemplatesApi } from "../store/leaseTemplatesApi";

const requests: AxiosRequestConfig[] = [];

function aStore() {
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
    requests.push(config);
    const data = config.url === "/lease-templates" && config.method === "get" ? { items: [{ id: "t1" }], total: 1, has_more: false } : { defaults: [], id: "t1", placeholders: [] };
    return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

afterEach(() => {
  requests.length = 0;
  vi.useRealTimers();
});

describe("leaseTemplatesApi writes", () => {
  it("getGenerateDefaults sends the host's local date for today defaults", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 11:30pm local: a UTC date would already be tomorrow for a US host.
    vi.setSystemTime(new Date(2026, 10, 6, 23, 30));
    await aStore().dispatch(leaseTemplatesApi.endpoints.getGenerateDefaults.initiate({ templateId: "t1", applicantId: "a1" }));
    expect(requests[0]).toMatchObject({ url: "/lease-templates/t1/generate-defaults", params: { applicant_id: "a1", today: "2026-11-06" } });
  });

  it("createLeaseTemplate posts the caller's form as it is, with a long timeout", async () => {
    const form = new FormData();
    form.append("name", "Standard");
    await aStore().dispatch(leaseTemplatesApi.endpoints.createLeaseTemplate.initiate(form));
    expect(requests[0]).toMatchObject({ url: "/lease-templates", method: "post", data: form, timeout: 300000 });
  });

  it("updateLeasePlaceholder patches only what it is given", async () => {
    await aStore().dispatch(
      leaseTemplatesApi.endpoints.updateLeasePlaceholder.initiate({ templateId: "t1", placeholderId: "p1", data: { required: false, default_source: null } }),
    );
    expect(requests[0]).toMatchObject({ url: "/lease-templates/t1/placeholders/p1", method: "patch" });
    expect(JSON.parse(String(requests[0]?.data))).toEqual({ required: false, default_source: null });
  });

  it("deleteLeaseTemplate and suggestPlaceholders go to the template's own address", async () => {
    const store = aStore();
    await store.dispatch(leaseTemplatesApi.endpoints.deleteLeaseTemplate.initiate("t1"));
    await store.dispatch(leaseTemplatesApi.endpoints.suggestPlaceholders.initiate("t1"));
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual(["delete /lease-templates/t1", "post /lease-templates/t1/suggest-placeholders"]);
  });

  it("editing a placeholder refreshes the defaults a lease would be filled in with", async () => {
    const store = aStore();
    await store.dispatch(leaseTemplatesApi.endpoints.getGenerateDefaults.initiate({ templateId: "t1", applicantId: "a1" }));
    await store.dispatch(leaseTemplatesApi.endpoints.getMultiGenerateDefaults.initiate({ template_ids: ["t1", "t2"], applicant_id: "a1" }));
    requests.length = 0;
    await store.dispatch(leaseTemplatesApi.endpoints.updateLeasePlaceholder.initiate({ templateId: "t1", placeholderId: "p1", data: { required: true } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requests.filter((request) => request.method === "get").map((request) => request.url)).toEqual(["/lease-templates/t1/generate-defaults"]);
    expect(requests.filter((request) => request.method === "post").map((request) => request.url)).toContain("/lease-templates/generate-defaults");
  });

  it("a write refreshes the list and the template read, and a delete only the list", async () => {
    const store = aStore();
    await store.dispatch(leaseTemplatesApi.endpoints.getLeaseTemplateById.initiate("t1"));
    await store.dispatch(leaseTemplatesApi.endpoints.getLeaseTemplates.initiate());
    requests.length = 0;
    await store.dispatch(leaseTemplatesApi.endpoints.updateLeasePlaceholder.initiate({ templateId: "t1", placeholderId: "p1", data: { required: true } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requests.filter((request) => request.method === "get").map((request) => request.url).sort()).toEqual(["/lease-templates", "/lease-templates/t1"]);
    requests.length = 0;
    await store.dispatch(leaseTemplatesApi.endpoints.deleteLeaseTemplate.initiate("t1"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requests.filter((request) => request.method === "get").map((request) => request.url)).toEqual(["/lease-templates"]);
  });
});
