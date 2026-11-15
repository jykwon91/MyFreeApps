import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../store/applicationsApi";
import "../store/companiesApi";

type Reply = { status: number; data: unknown };
const sent: InternalAxiosRequestConfig[] = [];
let companyName = "Old Name";

function respond(config: InternalAxiosRequestConfig): Reply {
  const url = config.url ?? "";
  if (config.method === "patch") {
    companyName = "New Name";
    return { status: 200, data: { id: "c1", name: companyName } };
  }
  if (url.includes("view=kanban")) {
    return { status: 200, data: { items: [{ id: "a1", company_name: companyName }] } };
  }
  return { status: 200, data: { items: [{ id: "a1", company_name: companyName }], total: 1 } };
}

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

type Initiate = {
  initiate: (arg?: unknown) => Parameters<ReturnType<typeof makeStore>["dispatch"]>[0];
};
const endpoints = baseApi.endpoints as unknown as Record<string, Initiate>;

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    sent.push(config);
    const { status, data } = respond(config);
    return Promise.resolve({ data, status, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
  companyName = "Old Name";
});

const countGets = (fragment: string) =>
  sent.filter((c) => c.method === "get" && (c.url ?? "").includes(fragment)).length;

describe("updateCompany", () => {
  it("refetches the applications list, kanban and detail so the new company name shows", async () => {
    const store = makeStore();
    const subs = [
      store.dispatch(endpoints.listApplicationsKanban.initiate()),
      store.dispatch(endpoints.listApplications.initiate({})),
      store.dispatch(endpoints.getApplication.initiate("a1")),
    ];
    await Promise.all(subs as unknown as Promise<unknown>[]);
    const kanbanBefore = countGets("view=kanban");
    const detailBefore = countGets("/applications/a1");
    const listBefore = countGets("/applications") - kanbanBefore - detailBefore;

    await store.dispatch(endpoints.updateCompany.initiate({ id: "c1", patch: { name: "New Name" } }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(countGets("view=kanban")).toBeGreaterThan(kanbanBefore);
    expect(countGets("/applications/a1")).toBeGreaterThan(detailBefore);
    expect(countGets("/applications") - countGets("view=kanban") - countGets("/applications/a1")).toBeGreaterThan(listBefore);
  });
});
