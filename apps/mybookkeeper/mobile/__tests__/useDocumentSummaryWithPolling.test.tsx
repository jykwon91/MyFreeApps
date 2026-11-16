import { useListTaxDocumentsQuery } from "@mybookkeeper/api-client/store/taxDocumentsApi";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { POLL_INTERVAL_MS } from "../src/constants/documents";
import { useDocumentSummaryWithPolling } from "../src/features/documents/useDocumentSummaryWithPolling";
import { store } from "../src/lib/store";

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(callback, [callback]);
  },
}));

const originalAdapter = api.defaults.adapter;
const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;

let inProgress = 0;
let asked: string[] = [];

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  inProgress = 1;
  asked = [];
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig) => {
    asked.push(config.url ?? "");
    const data = config.url?.includes("tax-documents")
      ? { documents: [], checklist: [] }
      : { total: 1, in_progress: inProgress, needs_review: 0 };
    return { data, status: 200, statusText: "", headers: {}, config } as never;
  };
  api.defaults.adapter = adapter;
});

afterEach(() => {
  jest.useRealTimers();
});

afterAll(() => {
  api.defaults.adapter = originalAdapter;
});

it("refreshes tax documents when a document finishes being read", async () => {
  const { result } = await renderHook(
    () => ({ summary: useDocumentSummaryWithPolling(), taxDocuments: useListTaxDocumentsQuery({ tax_year: 2025 }) }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.summary.data?.in_progress).toBe(1));
  await waitFor(() => expect(result.current.taxDocuments.currentData).toBeDefined());
  expect(asked.filter((url) => url.includes("tax-documents"))).toHaveLength(1);

  inProgress = 0;
  await act(async () => {
    await result.current.summary.refetch();
  });
  await waitFor(() => expect(asked.filter((url) => url.includes("tax-documents"))).toHaveLength(2));
});

it("checks the counts again while a document is being read, never the list", async () => {
  jest.useFakeTimers();
  const { result } = await renderHook(() => useDocumentSummaryWithPolling(), { wrapper });
  await waitFor(() => expect(result.current.data?.in_progress).toBe(1));
  const before = asked.length;

  await act(async () => {
    jest.advanceTimersByTime(POLL_INTERVAL_MS);
  });

  await waitFor(() => expect(asked.length).toBeGreaterThan(before));
  expect(new Set(asked)).toEqual(new Set(["/documents/summary"]));
});
