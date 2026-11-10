import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { classificationRulesApi } from "../store/classificationRulesApi";

const sent: InternalAxiosRequestConfig[] = [];

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => "w1" },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    sent.push(config);
    return Promise.resolve({ data: config.method === "get" ? [] : undefined, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
});

describe("classificationRulesApi", () => {
  it("lists, and refetches the list after a delete", async () => {
    const store = makeStore();
    const sub = store.dispatch(classificationRulesApi.endpoints.listClassificationRules.initiate());
    await sub;
    expect(sent.map((c) => `${c.method} ${c.url}`)).toEqual(["get /classification-rules"]);
    await store.dispatch(classificationRulesApi.endpoints.deleteClassificationRule.initiate("r1"));
    await tick();
    expect(sent.map((c) => `${c.method} ${c.url}`)).toEqual([
      "get /classification-rules",
      "delete /classification-rules/r1",
      "get /classification-rules",
    ]);
    sub.unsubscribe();
  });
});
