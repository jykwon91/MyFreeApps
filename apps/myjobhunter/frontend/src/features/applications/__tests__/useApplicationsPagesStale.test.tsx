/**
 * After a failed reload, the hook's own `data` is the last successful result,
 * which can be older than what the store holds. The list must show the store's
 * pages (`currentData`), so a row patched out of it stays out.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import type { ReactNode } from "react";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, describe, expect, it } from "vitest";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { useApplicationsPages } from "@myjobhunter/api-client/hooks/useApplicationsPages";
import type { Application } from "@myjobhunter/api-client/types/application";
import type { ApplicationListResponse } from "@myjobhunter/api-client/types/application-list-response";
import type { ApplicationsListQuery } from "@myjobhunter/api-client/types/application/applications-list-query";

const ARG: ApplicationsListQuery = { sort: "applied", order: "desc" };
const app = (id: string) => ({ id }) as Application;

let respond: () => { status: number; data: unknown } = () => ({ status: 200, data: { items: [], total: 0 } });

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config: InternalAxiosRequestConfig) => {
    const { status, data } = respond();
    const response = { data, status, statusText: "", headers: {}, config };
    return status < 400 ? Promise.resolve(response) : Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
  };
  api.defaults.adapter = adapter;
});

type UpdateQueryData = (
  endpoint: "listApplications",
  arg: ApplicationsListQuery,
  recipe: (draft: { pages: ApplicationListResponse[]; pageParams: number[] }) => void,
) => Parameters<ReturnType<typeof makeStore>["dispatch"]>[0];

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

describe("useApplicationsPages after a failed reload", () => {
  it("shows the pages the store holds, not the stale ones the hook last received", async () => {
    const store = makeStore();
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
    respond = () => ({ status: 200, data: { items: [app("a1"), app("a2")], total: 2 } satisfies ApplicationListResponse });
    const { result } = renderHook(() => useApplicationsPages(ARG), { wrapper });
    await waitFor(() => expect(result.current.applications.map(({ id }) => id)).toEqual(["a1", "a2"]));

    // Something drops a2 from the store (as a delete's optimistic update does), then the reload fails.
    const updateQueryData = baseApi.util.updateQueryData as unknown as UpdateQueryData;
    act(() => {
      store.dispatch(
        updateQueryData("listApplications", ARG, (draft) => {
          draft.pages = draft.pages.map((page) => ({ items: page.items.filter(({ id }) => id !== "a2"), total: page.total - 1 }));
        }),
      );
    });
    respond = () => ({ status: 503, data: { detail: "down" } });
    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.applications.map(({ id }) => id)).toEqual(["a1"]);
    expect(result.current.total).toBe(1);
  });
});
