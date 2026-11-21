// @vitest-environment jsdom
/**
 * A company's research run keeps only its in-flight state in the store: leave the company and reopen
 * it mid-run, and the reopened screen still sees the run going (so it doesn't offer, and pay for, a
 * second one), including a run started away from the screen, as after adding a company. A finished
 * run's result goes to the research cache, and its failure is gone once the screen that showed it
 * goes away, so a reopened company never shows an old failure.
 */
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import { act, renderHook, waitFor } from "@testing-library/react";
import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { createElement, type ReactNode } from "react";
import { Provider } from "react-redux";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useCompanyResearchRun } from "../hooks/useCompanyResearchRun";
import { useStartCompanyResearch } from "../hooks/useStartCompanyResearch";
import { useGetCompanyResearchQuery } from "../store/companiesApi";

interface Pending {
  config: InternalAxiosRequestConfig;
  resolve: (response: AxiosResponse) => void;
  reject: (error: unknown) => void;
}

const posts: Pending[] = [];
const RESEARCH = { id: "r1", company_id: "c1" };

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    if (config.method !== "post") {
      const response = { data: { detail: "No research" }, status: 404, statusText: "", headers: {}, config };
      return Promise.reject(new AxiosError("Not found", "ERR_BAD_REQUEST", config, null, response));
    }
    return new Promise((resolve, reject) => posts.push({ config, resolve, reject }));
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  posts.length = 0;
});

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

function wrapperFor(store: ReturnType<typeof makeStore>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(Provider, { store, children });
  };
}

/** The run's entry in the store, as a screen opened now would find it. */
function runStatus(store: ReturnType<typeof makeStore>): string | undefined {
  const mutations = store.getState()[baseApi.reducerPath].mutations as Record<string, { status: string } | undefined>;
  return mutations["company-research-c1"]?.status;
}

function succeed(pending: Pending): void {
  pending.resolve({ data: RESEARCH, status: 200, statusText: "", headers: {}, config: pending.config });
}

function fail(pending: Pending): void {
  const response = { data: { detail: "AI synthesis failed" }, status: 502, statusText: "", headers: {}, config: pending.config };
  pending.reject(new AxiosError("Bad gateway", "ERR_BAD_RESPONSE", pending.config, null, response));
}

describe("useCompanyResearchRun", () => {
  it("a reopened company still sees its run in flight, and then its result", async () => {
    const wrapper = wrapperFor(makeStore());

    const first = renderHook(() => useCompanyResearchRun("c1"), { wrapper });
    act(() => {
      void first.result.current[0]("c1");
    });
    await waitFor(() => expect(first.result.current[1].isLoading).toBe(true));
    first.unmount();

    const reopened = renderHook(() => useCompanyResearchRun("c1"), { wrapper });
    expect(reopened.result.current[1].isLoading).toBe(true);

    const other = renderHook(() => useCompanyResearchRun("c2"), { wrapper });
    expect(other.result.current[1].isLoading).toBe(false);

    await waitFor(() => expect(posts).toHaveLength(1));
    act(() => succeed(posts[0]));
    await waitFor(() => expect(reopened.result.current[1].isSuccess).toBe(true));
    expect(posts).toHaveLength(1);
  });

  it("sees a run started away from the company's screen, as after adding the company", async () => {
    const wrapper = wrapperFor(makeStore());
    const starter = renderHook(() => useStartCompanyResearch(), { wrapper });
    act(() => {
      void starter.result.current("c1").catch(() => undefined);
    });

    const screen = renderHook(() => useCompanyResearchRun("c1"), { wrapper });
    await waitFor(() => expect(screen.result.current[1].isLoading).toBe(true));

    await waitFor(() => expect(posts).toHaveLength(1));
    act(() => succeed(posts[0]));
    await waitFor(() => expect(screen.result.current[1].isLoading).toBe(false));
  });

  it("doesn't show a failure again once the screen that showed it has gone", async () => {
    const wrapper = wrapperFor(makeStore());
    const first = renderHook(() => useCompanyResearchRun("c1"), { wrapper });
    act(() => {
      void first.result.current[0]("c1");
    });
    await waitFor(() => expect(posts).toHaveLength(1));
    act(() => fail(posts[0]));
    await waitFor(() => expect(first.result.current[1].isError).toBe(true));
    first.unmount();

    const reopened = renderHook(() => useCompanyResearchRun("c1"), { wrapper });
    expect(reopened.result.current[1].isError).toBe(false);
    expect(reopened.result.current[1].isUninitialized).toBe(true);
  });

  it("doesn't show a failure that landed while no screen was open, and keeps a result in the research cache", async () => {
    const store = makeStore();
    const wrapper = wrapperFor(store);
    const first = renderHook(() => useCompanyResearchRun("c1"), { wrapper });
    act(() => {
      void first.result.current[0]("c1").catch(() => undefined);
    });
    await waitFor(() => expect(posts).toHaveLength(1));
    first.unmount();
    act(() => fail(posts[0]));
    await waitFor(() => expect(runStatus(store)).toBe("rejected"));

    const afterFailure = renderHook(() => useCompanyResearchRun("c1"), { wrapper });
    await waitFor(() => expect(afterFailure.result.current[1].isUninitialized).toBe(true));
    act(() => {
      void afterFailure.result.current[0]("c1");
    });
    await waitFor(() => expect(posts).toHaveLength(2));
    afterFailure.unmount();
    act(() => succeed(posts[1]));
    await waitFor(() => expect(runStatus(store)).toBe("fulfilled"));

    const afterSuccess = renderHook(
      () => ({ run: useCompanyResearchRun("c1"), research: useGetCompanyResearchQuery("c1") }),
      { wrapper },
    );
    await waitFor(() => expect(afterSuccess.result.current.run[1].isUninitialized).toBe(true));
    expect(afterSuccess.result.current.research.data).toEqual(RESEARCH);
  });
});
