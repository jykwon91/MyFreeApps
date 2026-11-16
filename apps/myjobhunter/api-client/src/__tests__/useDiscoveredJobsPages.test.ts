// @vitest-environment jsdom
// renderHook needs a DOM; the package's own code still runs DOM-free in every other test.
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import { renderHook, waitFor } from "@testing-library/react";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { createElement, type ReactNode } from "react";
import { Provider } from "react-redux";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useDiscoveredJobsPages } from "../hooks/useDiscoveredJobsPages";
import { discoverApi } from "../store/discoverApi";

const POLL_MS = 20;
const sent: InternalAxiosRequestConfig[] = [];

function makeStore() {
  return configureStore({
    reducer: { [discoverApi.reducerPath]: discoverApi.reducer },
    middleware: (getDefault) => getDefault().concat(discoverApi.middleware),
  });
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config: InternalAxiosRequestConfig) => {
    sent.push(config);
    const data = { items: [], total: 0, has_more: false, state: "inbox", scored_count: 0, total_count: 0 };
    return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
});

describe("useDiscoveredJobsPages polling", () => {
  let store: ReturnType<typeof makeStore>;
  let unmount: () => void;

  function mount() {
    store = makeStore();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(Provider, { store, children });
    ({ unmount } = renderHook(() => useDiscoveredJobsPages({ state: "inbox" }, POLL_MS), { wrapper }));
  }

  // Vitest globals are off, so Testing Library doesn't clean up on its own. Without this the hook keeps
  // polling after the test, and React renders once jsdom is gone ("window is not defined").
  afterEach(() => {
    unmount();
    store.dispatch(baseApi.util.resetApiState());
  });

  it("stops polling while the app is in the background and reloads the list as soon as it returns", async () => {
    mount();
    await waitFor(() => expect(sent.length).toBeGreaterThanOrEqual(2)); // polling while focused

    store.dispatch(baseApi.internalActions.onFocusLost());
    await pause(POLL_MS * 2); // let any poll already scheduled land
    const whileHidden = sent.length;
    await pause(POLL_MS * 8);
    expect(sent.length).toBe(whileHidden);

    store.dispatch(baseApi.internalActions.onFocus());
    await waitFor(() => expect(sent.length).toBeGreaterThan(whileHidden));
  });
});
