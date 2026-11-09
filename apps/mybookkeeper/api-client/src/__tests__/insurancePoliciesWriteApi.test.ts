import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { INSURANCE_UPLOAD_TIMEOUT_MS } from "../constants/insuranceUploads";
import "../store/insurancePoliciesApi";

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
    const data = config.url === "/insurance-policies" && config.method === "get" ? { items: [], total: 0, has_more: false } : { id: "p1", attachments: [] };
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
  return requests.filter((request) => request.method !== "get");
}

describe("insurancePoliciesApi writes", () => {
  it("creates a policy with the body as given", async () => {
    const [request] = await send("createInsurancePolicy", { property_id: "pr1", policy_name: "Landlord policy", fees_and_taxes_cents: 5000 });
    expect(request.method).toBe("post");
    expect(request.url).toBe("/insurance-policies");
    expect(JSON.parse(String(request.data))).toEqual({ property_id: "pr1", policy_name: "Landlord policy", fees_and_taxes_cents: 5000 });
  });

  it("updates a policy by id", async () => {
    const [request] = await send("updateInsurancePolicy", { policyId: "p1", data: { carrier: "Acme" } });
    expect(request.method).toBe("patch");
    expect(request.url).toBe("/insurance-policies/p1");
    expect(JSON.parse(String(request.data))).toEqual({ carrier: "Acme" });
  });

  it("deletes a policy by id", async () => {
    const [request] = await send("deleteInsurancePolicy", "p1");
    expect(request.method).toBe("delete");
    expect(request.url).toBe("/insurance-policies/p1");
  });

  it("reads an uploaded document by id", async () => {
    const [request] = await send("extractInsurancePolicy", { document_id: "d1" });
    expect(request.url).toBe("/insurance-policies/extract");
    expect(JSON.parse(String(request.data))).toEqual({ document_id: "d1" });
  });

  it("sends the caller's form to extract-upload with the long upload timeout", async () => {
    const form = new FormData();
    form.append("file", new Blob(["x"], { type: "application/pdf" }), "p.pdf");
    const [request] = await send("extractInsurancePolicyFromUpload", form);
    expect(request.url).toBe("/insurance-policies/extract-upload");
    expect(request.data).toBe(form);
    expect(request.timeout).toBe(INSURANCE_UPLOAD_TIMEOUT_MS);
  });

  it("sends the caller's form to the attachment endpoint with the long upload timeout", async () => {
    const form = new FormData();
    form.append("kind", "binder");
    const [request] = await send("uploadInsurancePolicyAttachment", { policyId: "p1", form });
    expect(request.method).toBe("post");
    expect(request.url).toBe("/insurance-policies/p1/attachments");
    expect(request.data).toBe(form);
    expect(request.timeout).toBe(INSURANCE_UPLOAD_TIMEOUT_MS);
  });

  it("removes an attachment by policy and attachment id", async () => {
    const [request] = await send("deleteInsurancePolicyAttachment", { policyId: "p1", attachmentId: "f1" });
    expect(request.method).toBe("delete");
    expect(request.url).toBe("/insurance-policies/p1/attachments/f1");
  });

  it("reloads the open policy after an attachment changes", async () => {
    const store = makeStore();
    await store.dispatch(endpoints.getInsurancePolicyById.initiate("p1"));
    requests.length = 0;
    await store.dispatch(endpoints.deleteInsurancePolicyAttachment.initiate({ policyId: "p1", attachmentId: "f1" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requests.filter((request) => request.method === "get").map((request) => request.url)).toEqual(["/insurance-policies/p1"]);
  });
});
