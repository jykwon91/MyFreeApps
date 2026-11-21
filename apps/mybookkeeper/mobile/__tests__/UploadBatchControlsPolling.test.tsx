import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, render, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { AccessibilityInfo } from "react-native";
import { Provider } from "react-redux";
import UploadBatchControls from "../src/features/capture/UploadBatchControls";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";

const POLL_MS = 20;

jest.mock("../src/constants/capture", () => ({ ...jest.requireActual("../src/constants/capture"), BATCH_STATUS_POLL_MS: 20 }));

const originalAdapter = api.defaults.adapter;
const pause = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

let statusRequests = 0;

beforeEach(() => {
  jest.clearAllMocks();
  statusRequests = 0;
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  const adapter: AxiosAdapter = (config) => {
    statusRequests += 1;
    const data = { batch_id: "batch-1", total: 4, completed: 1, failed: 0, status: "processing" };
    return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

afterEach(() => {
  store.dispatch(baseApi.internalActions.onFocus());
  api.defaults.adapter = originalAdapter;
});

describe("UploadBatchControls polling", () => {
  it("stops asking how far the read has got while the app is in the background, and asks again when it returns", async () => {
    await render(
      <Provider store={store}>
        <ToastProvider bottomOffset={0}>
          <UploadBatchControls batchId="batch-1" name="receipts.zip" uri="cache:/receipts.zip" />
        </ToastProvider>
      </Provider>,
    );
    await waitFor(() => expect(statusRequests).toBeGreaterThanOrEqual(2));

    await act(async () => {
      store.dispatch(baseApi.internalActions.onFocusLost());
    });
    await pause(POLL_MS * 2);
    const whileHidden = statusRequests;
    await pause(POLL_MS * 8);
    expect(statusRequests).toBe(whileHidden);

    await act(async () => {
      store.dispatch(baseApi.internalActions.onFocus());
    });
    await waitFor(() => expect(statusRequests).toBeGreaterThan(whileHidden));
  });

  it("reads out that the zip is being read and when it is done, not the count at every check", async () => {
    const counts = [1, 2, 3, 4];
    api.defaults.adapter = (config) => {
      statusRequests += 1;
      const completed = counts[Math.min(statusRequests - 1, counts.length - 1)];
      const data = { batch_id: "batch-1", total: 4, completed, failed: 0, status: completed === 4 ? "done" : "processing" };
      return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
    };
    await render(
      <Provider store={store}>
        <ToastProvider bottomOffset={0}>
          <UploadBatchControls batchId="batch-1" name="receipts.zip" uri="cache:/receipts.zip" />
        </ToastProvider>
      </Provider>,
    );
    await waitFor(() => expect(AccessibilityInfo.announceForAccessibilityWithOptions).toHaveBeenCalledWith("4 of 4 read", { queue: true }));
    expect(jest.mocked(AccessibilityInfo.announceForAccessibilityWithOptions).mock.calls.map(([line]) => line)).toEqual(["Reading 4 files", "4 of 4 read"]);
  });
});
