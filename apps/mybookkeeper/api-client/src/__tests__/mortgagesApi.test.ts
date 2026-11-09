import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MORTGAGE_UPLOAD_TIMEOUT_MS } from "../constants/mortgageUpload";
import { mortgageMarketApi } from "../store/mortgageMarketApi";
import { mortgagesApi } from "../store/mortgagesApi";

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
    return Promise.resolve({ data: {}, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  seen = [];
});

describe("mortgagesApi writes", () => {
  it("creates a loan with a POST", async () => {
    await newStore().dispatch(mortgagesApi.endpoints.createMortgage.initiate({ property_id: "p1", rate_type: "fixed" }));
    expect(seen[0]).toMatchObject({ method: "post", url: "/mortgages" });
    expect(JSON.parse(String(seen[0].data))).toEqual({ property_id: "p1", rate_type: "fixed" });
  });

  it("changes a loan with a PATCH and removes it with a DELETE", async () => {
    const store = newStore();
    await store.dispatch(mortgagesApi.endpoints.updateMortgage.initiate({ mortgageId: "m1", data: { lender: "TDECU" } }));
    await store.dispatch(mortgagesApi.endpoints.deleteMortgage.initiate("m1"));
    expect(seen[0]).toMatchObject({ method: "patch", url: "/mortgages/m1" });
    expect(seen[1]).toMatchObject({ method: "delete", url: "/mortgages/m1" });
  });

  it("reads a library document by id", async () => {
    await newStore().dispatch(mortgagesApi.endpoints.extractMortgage.initiate({ document_id: "d1" }));
    expect(seen[0]).toMatchObject({ method: "post", url: "/mortgages/extract" });
    expect(JSON.parse(String(seen[0].data))).toEqual({ document_id: "d1" });
  });

  it("uploads a statement as the caller's form, with the long upload timeout", async () => {
    const form = new FormData();
    form.append("file", new Blob(["x"]), "statement.pdf");
    await newStore().dispatch(mortgagesApi.endpoints.extractMortgageFromUpload.initiate(form));
    expect(seen[0]).toMatchObject({ method: "post", url: "/mortgages/extract-upload", timeout: MORTGAGE_UPLOAD_TIMEOUT_MS });
    expect(seen[0].data).toBe(form);
  });

  it("asks for the rate check with today's date", async () => {
    await newStore().dispatch(mortgageMarketApi.endpoints.getMortgageRateWatch.initiate());
    expect(seen[0]).toMatchObject({ url: "/mortgage-market/rate-watch" });
    expect(String((seen[0].params as { today: string }).today)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
