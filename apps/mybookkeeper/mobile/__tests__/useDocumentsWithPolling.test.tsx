import { documentsApi } from "@mybookkeeper/api-client/store/documentsApi";
import { taxDocumentsApi } from "@mybookkeeper/api-client/store/taxDocumentsApi";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { useDocumentsWithPolling } from "../src/features/documents/useDocumentsWithPolling";
import { store } from "../src/lib/store";

const originalAdapter = api.defaults.adapter;

afterAll(() => {
  api.defaults.adapter = originalAdapter;
});

it("refreshes tax documents when a document finishes being read", async () => {
  store.dispatch(baseApi.util.resetApiState());
  let status = "processing";
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig) =>
    ({ data: [{ id: "d1", status }], status: 200, statusText: "", headers: {}, config }) as never;
  api.defaults.adapter = adapter;
  const invalidate = jest.spyOn(taxDocumentsApi.util, "invalidateTags");
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;

  const { result } = await renderHook(() => useDocumentsWithPolling(), { wrapper });
  await waitFor(() => expect(result.current.data).toHaveLength(1));
  expect(invalidate).not.toHaveBeenCalled();

  status = "completed";
  await act(async () => {
    store.dispatch(documentsApi.util.invalidateTags(["Document"]));
  });
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith([{ type: "TaxReturn", id: "TAX_DOCS" }]));
});
