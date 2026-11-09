import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { UTILITY_PLAN_UPLOAD_TIMEOUT_MS } from "../constants/utilityPlanUpload";
import { marketRateBenchmarksApi } from "../store/marketRateBenchmarksApi";
import { utilityOffersApi } from "../store/utilityOffersApi";
import { utilityPlansApi } from "../store/utilityPlansApi";

let seen: InternalAxiosRequestConfig[] = [];

function newStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

const TODAY = /^\d{4}-\d{2}-\d{2}$/;

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => "w1" },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    seen.push(config);
    const data = config.url === "/utility-plans" && config.method === "get" ? { items: [] } : config.url === "/market-rate-benchmarks" ? [] : {};
    return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  seen = [];
});

describe("utilityPlansApi reads", () => {
  it("lists with today's date and only the filters given", async () => {
    await newStore().dispatch(utilityPlansApi.endpoints.getUtilityPlans.initiate({ limit: 100, service_type: "water" }));
    expect(seen[0]).toMatchObject({ method: "get", url: "/utility-plans" });
    const params = seen[0].params as Record<string, unknown>;
    expect(params).toMatchObject({ limit: 100, service_type: "water" });
    expect(String(params.today)).toMatch(TODAY);
    expect(params).not.toHaveProperty("property_id");
    expect(params).not.toHaveProperty("offset");
  });

  it("reads the renewal alerts and the rate comparison with today's date", async () => {
    const store = newStore();
    await store.dispatch(utilityPlansApi.endpoints.getUtilityPlanRenewalAlerts.initiate());
    await store.dispatch(utilityPlansApi.endpoints.getUtilityPlanRateComparison.initiate());
    expect(seen[0]).toMatchObject({ url: "/utility-plans/renewal-alerts" });
    expect(seen[1]).toMatchObject({ url: "/utility-plans/rate-comparison" });
    expect(String((seen[0].params as { today: string }).today)).toMatch(TODAY);
    expect(String((seen[1].params as { today: string }).today)).toMatch(TODAY);
  });
});

describe("utilityPlansApi writes", () => {
  it("creates a plan with a POST that carries today's date", async () => {
    await newStore().dispatch(utilityPlansApi.endpoints.createUtilityPlan.initiate({ property_id: "p1", service_type: "electricity", rate_type: "fixed", provider_name: "Reliant" }));
    expect(seen[0]).toMatchObject({ method: "post", url: "/utility-plans" });
    const body = JSON.parse(String(seen[0].data));
    expect(body).toMatchObject({ property_id: "p1", provider_name: "Reliant" });
    expect(body.today).toMatch(TODAY);
  });

  it("changes a plan with a PATCH and removes it with a DELETE", async () => {
    const store = newStore();
    await store.dispatch(utilityPlansApi.endpoints.updateUtilityPlan.initiate({ planId: "u1", data: { provider_name: "TXU" } }));
    await store.dispatch(utilityPlansApi.endpoints.deleteUtilityPlan.initiate("u1"));
    expect(seen[0]).toMatchObject({ method: "patch", url: "/utility-plans/u1" });
    expect(JSON.parse(String(seen[0].data))).toMatchObject({ provider_name: "TXU" });
    expect(seen[1]).toMatchObject({ method: "delete", url: "/utility-plans/u1" });
  });

  it("reads a library document by id", async () => {
    await newStore().dispatch(utilityPlansApi.endpoints.extractUtilityPlan.initiate({ document_id: "d1" }));
    expect(seen[0]).toMatchObject({ method: "post", url: "/utility-plans/extract" });
    expect(JSON.parse(String(seen[0].data))).toEqual({ document_id: "d1" });
  });

  it("uploads a bill as the caller's form, with the long upload timeout", async () => {
    const form = new FormData();
    form.append("file", new Blob(["x"]), "bill.pdf");
    await newStore().dispatch(utilityPlansApi.endpoints.extractUtilityPlanFromUpload.initiate(form));
    expect(seen[0]).toMatchObject({ method: "post", url: "/utility-plans/extract-upload", timeout: UTILITY_PLAN_UPLOAD_TIMEOUT_MS });
    expect(seen[0].data).toBe(form);
  });
});

describe("the market side", () => {
  it("searches the offer feed only when asked, with today's date and any minimum term", async () => {
    await newStore().dispatch(utilityOffersApi.endpoints.findBetterUtilityPlans.initiate({ minTermMonths: 12 }));
    expect(seen[0]).toMatchObject({ url: "/utility-plans/offers" });
    expect(seen[0].params).toMatchObject({ min_term_months: 12 });
  });

  it("records a market rate with a PUT per service, and removes it with a DELETE", async () => {
    const store = newStore();
    await store.dispatch(marketRateBenchmarksApi.endpoints.upsertMarketRateBenchmark.initiate({ serviceType: "internet", data: { monthly_cents: 6999, observed_on: "2026-01-05" } }));
    await store.dispatch(marketRateBenchmarksApi.endpoints.deleteMarketRateBenchmark.initiate("internet"));
    expect(seen[0]).toMatchObject({ method: "put", url: "/market-rate-benchmarks/internet" });
    const body = JSON.parse(String(seen[0].data));
    expect(body).toMatchObject({ monthly_cents: 6999, observed_on: "2026-01-05" });
    expect(body.today).toMatch(TODAY);
    expect(seen[1]).toMatchObject({ method: "delete", url: "/market-rate-benchmarks/internet" });
  });

  it("lists the recorded rates with today's date", async () => {
    await newStore().dispatch(marketRateBenchmarksApi.endpoints.getMarketRateBenchmarks.initiate());
    expect(seen[0]).toMatchObject({ method: "get", url: "/market-rate-benchmarks" });
    expect(String((seen[0].params as { today: string }).today)).toMatch(TODAY);
  });
});
