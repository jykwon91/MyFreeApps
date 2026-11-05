import { useListTaxDocumentsQuery } from "@mybookkeeper/api-client/store/taxDocumentsApi";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { useDocumentsWithPolling } from "../src/features/documents/useDocumentsWithPolling";
import { store } from "../src/lib/store";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined }));

const originalAdapter = api.defaults.adapter;

afterAll(() => {
  api.defaults.adapter = originalAdapter;
});

it("refreshes tax documents when a document finishes being read", async () => {
  store.dispatch(baseApi.util.resetApiState());
  let status = "processing";
  let taxReads = 0;
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig) => {
    const isTax = config.url?.includes("tax-documents") ?? false;
    if (isTax) taxReads += 1;
    const data = isTax ? { documents: [], checklist: [] } : [{ id: "d1", status }];
    return { data, status: 200, statusText: "", headers: {}, config } as never;
  };
  api.defaults.adapter = adapter;
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;

  const { result } = await renderHook(
    () => ({ documents: useDocumentsWithPolling(), taxDocuments: useListTaxDocumentsQuery({ tax_year: 2025 }) }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.documents.data).toHaveLength(1));
  await waitFor(() => expect(result.current.taxDocuments.currentData).toBeDefined());
  expect(taxReads).toBe(1);

  status = "completed";
  await act(async () => {
    await result.current.documents.refetch();
  });
  await waitFor(() => expect(taxReads).toBe(2));
});
